# PrismaService - Technical Documentation

## Overview

The **PrismaService** is an injectable NestJS service that provides Prisma ORM integration for database operations. It extends `PrismaClient` and implements NestJS lifecycle hooks to manage database connections throughout the application lifecycle.

## Purpose

Provide a centralized, type-safe database access layer that:
- Integrates Prisma ORM v7 with NestJS v11
- Manages database connections using application lifecycle
- Validates configuration before startup
- Provides all Prisma Client methods to repository implementations

## Architecture

### Design Patterns

#### 1. Singleton Pattern
PrismaService follows the Singleton pattern through NestJS's Dependency Injection system:
- Single instance per application
- Shared across all repositories that inject it
- Connection pooling managed by single client instance

#### 2. Adapter Pattern
Uses `PrismaPg` adapter for PostgreSQL connections:
- Abstracts database driver implementation
- Enables connection pooling
- Optimizes query performance

#### 3. Lifecycle Pattern
Implements NestJS lifecycle hooks for resource management:
- `OnModuleInit`: Connects to database when module initializes
- `OnModuleDestroy`: Disconnects gracefully on shutdown

### Class Structure

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy
```

**Extends**:
- `PrismaClient`: Inherits all Prisma ORM methods

**Implements**:
- `OnModuleInit`: NestJS lifecycle hook for initialization
- `OnModuleDestroy`: NestJS lifecycle hook for cleanup

## Integration

### ConfigService Dependency

PrismaService depends on ConfigService for environment configuration:

```typescript
constructor(private readonly configService: ConfigService)
```

**Configuration Flow**:
1. ConfigService injected via constructor
2. Validates `DATABASE_URL` exists using `configService.has()`
3. Retrieves connection string using `configService.get()`
4. Fails fast if DATABASE_URL is missing

**Why ConfigService Instead of process.env**:
- Centralized configuration management
- Type-safe access to environment variables
- Consistent pattern across the application
- Easier to test and mock

### Database Connection

**Adapter Setup** (Required for Prisma v7 + PostgreSQL):
```typescript
// Validate DATABASE_URL exists
if (!configService.has('DATABASE_URL')) {
  throw new Error(
    'DATABASE_URL environment variable is required for database connection. ' +
    'Please ensure it is set in your .env file or environment.'
  );
}

// Get connection string from ConfigService
const connectionString = configService.get('DATABASE_URL')!;

// Initialize PostgreSQL adapter
const adapter = new PrismaPg({ connectionString });

// Initialize PrismaClient with adapter
super({ adapter });
```

**Why Adapter is Required**:
- Prisma v7 requires driver adapters for all database types
- `PrismaPg` adapter enables PostgreSQL connectivity
- Provides connection pooling and optimized performance
- Uses `pg` driver under the hood

**Connection Lifecycle**:
1. ConfigService validates DATABASE_URL in constructor
2. Adapter created with connection string from ConfigService
3. Connection established in `onModuleInit` via `$connect()`
4. Connection closed in `onModuleDestroy` via `$disconnect()`

## Lifecycle Management

### Initialization (onModuleInit)

**When**: Called when NestJS module initializes
**Purpose**: Establish database connection
**Behavior**: Asynchronous to ensure connection before app accepts requests

```typescript
async onModuleInit() {
  await this.$connect();
}
```

**Failure Handling**: If connection fails, application startup is prevented

### Cleanup (onModuleDestroy)

**When**: Called when application shuts down (SIGTERM, SIGINT)
**Purpose**: Gracefully close database connection
**Behavior**: Prevents connection leaks and ensures clean shutdown

```typescript
async onModuleDestroy() {
  await this.$disconnect();
}
```

## Prisma v7 + NestJS Configuration

### CommonJS Module Format

**Required for NestJS Compatibility**:

Prisma v7 defaults to ES modules, but NestJS uses CommonJS. Configure in `schema.prisma`:

```prisma
generator client {
  provider     = "prisma-client-js"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}
```

**Why This is Required**:
- NestJS uses CommonJS module system
- Prisma v7 defaults to ES modules
- Without `moduleFormat = "cjs"`, you'll get `exports is not defined` errors

### Build Configuration

**NestJS CLI Asset Copying**:

Configure `nest-cli.json` to copy generated Prisma files to `dist/`:

```json
{
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": [
      {
        "include": "generated/**/*",
        "outDir": "dist/src"
      }
    ]
  }
}
```

**Why This is Required**:
- TypeScript doesn't copy non-.ts files during compilation
- Prisma generates .js files that must be copied to dist/
- Without this, you'll get `Cannot find module` errors at runtime

## Usage

### In Repository Implementations

**Step 1**: Import DatabaseModule in your repository module

```typescript
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: 'SubscriberRepository',
      useClass: PrismaSubscriberRepository,
    },
  ],
  exports: ['SubscriberRepository'],
})
export class SubscriberModule {}
```

**Step 2**: Inject PrismaService in repository implementation

```typescript
@Injectable()
export class PrismaSubscriberRepository implements SubscriberRepositoryInterface {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Subscriber[]> {
    return this.prisma.subscriber.findMany();
  }

  async findById(id: string): Promise<Subscriber | null> {
    return this.prisma.subscriber.findUnique({
      where: { id }
    });
  }

  async create(data: CreateSubscriberDto): Promise<Subscriber> {
    return this.prisma.subscriber.create({ data });
  }

  async update(id: string, data: UpdateSubscriberDto): Promise<Subscriber> {
    return this.prisma.subscriber.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.subscriber.delete({ where: { id } });
  }
}
```

### Transaction Support

**Using Prisma Interactive Transactions**:
```typescript
async transferData(fromId: string, toId: string) {
  return this.prisma.$transaction(async (tx) => {
    const from = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: 100 } },
    });

    const to = await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: 100 } },
    });

    return { from, to };
  });
}
```

### Raw Queries

**When needed**:
```typescript
async customQuery() {
  return this.prisma.$queryRaw`
    SELECT * FROM users WHERE status = 'active'
  `;
}
```

## Error Handling

### Configuration Errors

**Missing DATABASE_URL**:

If `DATABASE_URL` is not set, Prisma will fail during `$connect()` in `onModuleInit`:

```
PrismaClientInitializationError: error: Environment variable not found: DATABASE_URL
```

**Resolution**:
1. Create `.env` file in project root
2. Add `DATABASE_URL=postgresql://user:password@localhost:5432/dbname`
3. Ensure dotenv is loaded (ConfigModule does this automatically)
4. Restart application

**Module Format Errors**:

If `moduleFormat = "cjs"` is missing from `schema.prisma`:

```
ReferenceError: exports is not defined
```

**Resolution**:
1. Add `moduleFormat = "cjs"` to `generator client` in `schema.prisma`
2. Run `npx prisma generate`
3. Rebuild application with `npm run build`

**Module Not Found Errors**:

If nest-cli.json assets configuration is missing:

```
Error: Cannot find module '../../generated/prisma'
```

**Resolution**:
1. Add assets configuration to `nest-cli.json` (see Build Configuration section above)
2. Run clean build: `rm -rf dist && npm run build`
3. Restart application

### Connection Errors

**Connection Refused**:
- Check database server is running
- Verify connection string is correct
- Check network/firewall settings

**Authentication Failed**:
- Verify database credentials
- Check user permissions
- Confirm database exists

## Best Practices

### 1. Repository Pattern
- Always use PrismaService through repository implementations
- Never inject PrismaService directly in controllers or use cases
- Keep database logic isolated in repository layer

### 2. Transaction Handling
- Use Prisma transactions for operations that must be atomic
- Keep transaction scope as small as possible
- Handle transaction errors appropriately

### 3. Query Optimization
- Use `select` to fetch only needed fields
- Use `include` wisely to avoid N+1 queries
- Consider using `findUnique` instead of `findFirst` when possible

### 4. Type Safety
- Leverage Prisma's generated types
- Use TypeScript strict mode
- Avoid `any` types in repository implementations

### 5. Error Handling
- Always handle Prisma errors (not found, unique constraint, etc.)
- Provide meaningful error messages
- Log errors appropriately

## Testing

### Unit Testing Repositories

**Mock PrismaService**:
```typescript
describe('PrismaSubscriberRepository', () => {
  let repository: PrismaSubscriberRepository;
  let prisma: PrismaService;

  const mockPrismaService = {
    subscriber: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaSubscriberRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<PrismaSubscriberRepository>(
      PrismaSubscriberRepository,
    );
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should find all subscribers', async () => {
    const mockSubscribers = [
      { id: '1', email: 'test@example.com' },
    ];
    mockPrismaService.subscriber.findMany.mockResolvedValue(
      mockSubscribers,
    );

    const result = await repository.findAll();

    expect(result).toEqual(mockSubscribers);
    expect(mockPrismaService.subscriber.findMany).toHaveBeenCalled();
  });
});
```

### Integration Testing

For integration tests with real database, use test database:
```typescript
beforeAll(async () => {
  // Use test DATABASE_URL
  connectionString = 'postgresql://test:test@localhost:5432/testdb';
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

## Performance Considerations

### Connection Pooling

PrismaPg adapter provides connection pooling:
- Reuses database connections
- Reduces connection overhead
- Improves query performance

**Default Pool Settings**:
- Managed automatically by adapter
- Can be tuned via connection string parameters

### Query Performance

**Use Prisma Extensions for Logging**:
```typescript
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

**Monitor Slow Queries**:
- Use Prisma Studio for query analysis
- Enable query logging in development
- Profile production queries

## Troubleshooting

### Service Not Available

**Problem**: Cannot inject PrismaService in repository

**Solution**:
1. Verify DatabaseModule is imported in repository module
2. Check PrismaService is exported from DatabaseModule
3. Ensure module imports are correct

### Module Not Found at Runtime

**Problem**: `Error: Cannot find module '../../generated/prisma'` when starting application

**Root Cause**: Generated Prisma files not copied to `dist/` during build

**Solutions**:
1. Add assets configuration to `nest-cli.json`:
```json
{
  "compilerOptions": {
    "assets": [
      {
        "include": "generated/**/*",
        "outDir": "dist/src"
      }
    ]
  }
}
```
2. Run clean build: `rm -rf dist && npm run build`
3. Verify files exist in `dist/src/generated/prisma/`

### Exports Not Defined Error

**Problem**: `ReferenceError: exports is not defined` when starting application

**Root Cause**: Prisma v7 generates ES modules by default, but NestJS uses CommonJS

**Solutions**:
1. Add `moduleFormat = "cjs"` to `schema.prisma`:
```prisma
generator client {
  provider     = "prisma-client-js"
  moduleFormat = "cjs"
}
```
2. Regenerate client: `npx prisma generate`
3. Rebuild: `npm run build`

### Adapter Error: Cannot Read __internal

**Problem**: `TypeError: Cannot read properties of undefined (reading '__internal')`

**Root Cause**: PrismaService not properly initialized with adapter

**Solutions**:
1. Verify adapter is created in constructor with ConfigService:
```typescript
constructor(private readonly configService: ConfigService) {
  if (!configService.has('DATABASE_URL')) {
    throw new Error(
      'DATABASE_URL environment variable is required for database connection. ' +
        'Please ensure it is set in your .env file or environment.',
    );
  }
  const connectionString = configService.get('DATABASE_URL')!;
  const adapter = new PrismaPg({ connectionString });
  super({ adapter });
}
```
2. Ensure `@prisma/adapter-pg` is installed: `npm install @prisma/adapter-pg pg`
3. Rebuild application

### Connection Timeout

**Problem**: Database connection times out on startup

**Solutions**:
1. Verify database server is accessible
2. Check DATABASE_URL format: `postgresql://user:password@host:port/database`
3. Verify .env file is loaded (ConfigModule should do this)
4. Check network/firewall rules

### Type Errors

**Problem**: TypeScript errors with Prisma types

**Solutions**:
1. Run `npx prisma generate` to regenerate types
2. Restart TypeScript server in IDE
3. Check Prisma schema is valid
4. Verify imports from `../../generated/prisma` (relative path)

### Migration Issues

**Problem**: Database schema out of sync

**Solutions**:
1. Run `npx prisma migrate dev` in development
2. Run `npx prisma migrate deploy` in production
3. Check migration files for conflicts
4. Reset database if needed (development only): `npx prisma migrate reset`

## Security

### Best Practices

1. **Never Log Connection Strings**
   ```typescript
   // L DON'T DO
   console.log('DB URL:', connectionString);

   //  DO
   console.log('DB connected:', configService.has('DATABASE_URL'));
   ```

2. **Use Parameterized Queries**
   - Always use Prisma's query builder
   - Avoid raw SQL when possible
   - Use `$queryRaw` with template literals for safety

3. **Validate Input**
   - Validate all input before database operations
   - Use DTOs for type safety
   - Implement proper authorization checks

4. **Protect Sensitive Data**
   - Never return password fields
   - Use `select` to exclude sensitive columns
   - Implement field-level security

## Extensibility

### Future Enhancements

1. **Query Logging Middleware**
   ```typescript
   prisma.$use(async (params, next) => {
     const before = Date.now();
     const result = await next(params);
     const after = Date.now();
     console.log(`Query ${params.model}.${params.action} took ${after - before}ms`);
     return result;
   });
   ```

2. **Soft Delete Middleware**
   ```typescript
   prisma.$use(async (params, next) => {
     if (params.action === 'delete') {
       params.action = 'update';
       params.args['data'] = { deletedAt: new Date() };
     }
     return next(params);
   });
   ```

3. **Read Replicas**
   - Configure multiple Prisma clients
   - Route read queries to replicas
   - Route write queries to primary

4. **Connection Retry Logic**
   - Implement exponential backoff
   - Handle transient connection failures
   - Configure max retry attempts

## Conclusion

PrismaService provides a robust, type-safe foundation for database operations in the NestJS application. By following the documented patterns and best practices, you can build maintainable and performant repository implementations.

**Key Benefits**:
-  Type-safe database access
-  Automatic connection management
-  Fail-fast configuration validation
-  Clean separation of concerns
-  Easy to test and mock
-  Optimized connection pooling
-  NestJS lifecycle integration
