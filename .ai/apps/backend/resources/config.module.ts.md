# ConfigModule - Technical Documentation

## Overview

The **ConfigModule** is a global NestJS module responsible for managing all application environment variables in a centralized, type-safe manner following the Singleton pattern.

## Purpose

Provide a single, type-safe, and testable interface for accessing and manipulating environment variables throughout the application, eliminating direct access to `process.env` and ensuring consistency.

## Architecture

### Components

1. **ConfigService** ([config.service.ts](../../../apps/backend/src/config/config.service.ts))
   - Singleton service encapsulating all configuration management logic
   - Stores variables in a private `Map` for O(1) performance
   - Strong typing with TypeScript generics

2. **ConfigModule** ([config.module.ts](../../../apps/backend/src/config/config.module.ts))
   - NestJS module marked as `@Global()`
   - Responsible for loading `dotenv` before initialization
   - Exports ConfigService for application-wide use

## Design Patterns

### 1. Singleton Pattern
ConfigService follows the Singleton pattern through NestJS's Dependency Injection system:
- Default `DEFAULT` scope ensures single instance
- Same instance shared across entire application
- State maintained throughout application lifecycle

### 2. Module Pattern
Uses NestJS module pattern with `@Global()` decorator:
- Automatic availability in all modules
- No need for repeated imports
- Lazy loading when needed

### 3. Type-Safe Access Pattern
Strongly typed interface with generics:
```typescript
get<K extends ConfigKey>(key: K): EnvConfig[K]
```
- Full autocomplete in IDE
- Compile-time type-checking
- Return type inference based on key

## Public Interface

### Types

```typescript
interface EnvConfig {
  APP_NAME: string | null;
  APP_PORT: string | null;
  NODE_ENV: string | null;
  DATABASE_URL: string | null;
  DIRECT_URL: string | null;
  TELEGRAM_BOT_TOKEN: string | null;
  AUTHORIZED_USER_IDS: string | null;
  TWITCH_CLIENT_ID: string | null;
  TWITCH_CLIENT_SECRET: string | null;
  TWITCH_CHANNEL: string | null;
}

type ConfigKey = keyof EnvConfig;
```

### Methods

#### `get<K extends ConfigKey>(key: K): EnvConfig[K]`
Returns the current value of a configuration key.

**Parameters:**
- `key`: Configuration key (type-safe)

**Returns:**
- `string | null`: Variable value or `null` if not defined

**Example:**
```typescript
const port = this.configService.get('APP_PORT');
// port is inferred as string | null
```

#### `set<K extends ConfigKey>(key: K, value: EnvConfig[K]): void`
Overwrites the value of a configuration key at runtime.

**Parameters:**
- `key`: Configuration key (type-safe)
- `value`: New value (must be compatible with key type)

**Returns:**
- `void`

**Use cases:**
- Unit tests (mocking values)
- Dynamic runtime configuration
- Temporary override for specific features

#### `has(key: ConfigKey): boolean`
Checks whether a key has a defined value (not `null` or `undefined`).

**Parameters:**
- `key`: Configuration key

**Returns:**
- `boolean`: `true` if key has value, `false` otherwise

**Example:**
```typescript
if (!this.configService.has('TELEGRAM_BOT_TOKEN')) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

const token = this.configService.get('TELEGRAM_BOT_TOKEN');
// Here we know token is not null
```

## Rules and Restrictions

### 1. Validation Responsibility
⚠️ **IMPORTANT**: ConfigService does **NOT** validate environment variables.

**Reason:** Separation of concerns. Validation should be done by the service consumer.

**Recommended pattern:**
```typescript
@Injectable()
export class TelegramService {
  constructor(private readonly configService: ConfigService) {
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.configService.has('TELEGRAM_BOT_TOKEN')) {
      throw new Error('TELEGRAM_BOT_TOKEN is required for TelegramService');
    }

    if (!this.configService.has('AUTHORIZED_USER_IDS')) {
      throw new Error('AUTHORIZED_USER_IDS is required for TelegramService');
    }
  }
}
```

### 2. Default Values
All undefined variables return `null` (not `undefined` or empty string).

**Reason:** Consistency and easy checking with `has()`.

### 3. Typing
Currently all variables are typed as `string | null`.

**Type conversions** must be done by consumers:
```typescript
const port = this.configService.get('APP_PORT');
const portNumber = port ? parseInt(port, 10) : 3000;
```

### 4. Global Scope
The module is marked as `@Global()`, therefore:
- ✅ Automatically available in all modules
- ❌ Should not be imported in feature modules
- ✅ Should be imported **only** in `AppModule`

### 5. Dotenv Loading
`dotenv.config()` is executed **in ConfigModule**, not in `main.ts`.

**Reason:** Keeps configuration responsibility isolated in the appropriate module.

## Usage Examples

### 1. Basic Service Usage
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class DatabaseService {
  constructor(private readonly configService: ConfigService) {}

  async connect(): Promise<void> {
    const dbUrl = this.configService.get('DATABASE_URL');

    if (!dbUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    // Connect to database using dbUrl
  }
}
```

### 2. Constructor Validation
```typescript
@Injectable()
export class TwitchService {
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly configService: ConfigService) {
    // Validate and store in private properties
    if (!this.configService.has('TWITCH_CLIENT_ID')) {
      throw new Error('TWITCH_CLIENT_ID is required');
    }
    if (!this.configService.has('TWITCH_CLIENT_SECRET')) {
      throw new Error('TWITCH_CLIENT_SECRET is required');
    }

    this.clientId = this.configService.get('TWITCH_CLIENT_ID')!;
    this.clientSecret = this.configService.get('TWITCH_CLIENT_SECRET')!;
  }
}
```

### 3. Type Conversion
```typescript
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  getPort(): number {
    const port = this.configService.get('APP_PORT');
    return port ? parseInt(port, 10) : 3000;
  }

  isProduction(): boolean {
    const env = this.configService.get('NODE_ENV');
    return env === 'production';
  }

  getAuthorizedUserIds(): number[] {
    const ids = this.configService.get('AUTHORIZED_USER_IDS');
    if (!ids) return [];

    return ids
      .split(',')
      .map(id => parseInt(id.trim(), 10))
      .filter(id => !isNaN(id));
  }
}
```

### 4. Testing Usage
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '../config/config.service';
import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            has: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should throw error if TELEGRAM_BOT_TOKEN is missing', () => {
    jest.spyOn(configService, 'has').mockReturnValue(false);

    expect(() => new TelegramService(configService)).toThrow(
      'TELEGRAM_BOT_TOKEN is required',
    );
  });

  it('should initialize correctly with valid config', () => {
    jest.spyOn(configService, 'has').mockReturnValue(true);
    jest.spyOn(configService, 'get').mockReturnValue('mock-token');

    expect(() => new TelegramService(configService)).not.toThrow();
  });
});
```

## Performance

### Performance Characteristics

1. **Initial Loading**: O(n) where n = number of variables (executed only once)
2. **Read (get)**: O(1) - Map lookup
3. **Write (set)**: O(1) - Map insert
4. **Check (has)**: O(1) - Map lookup + null check

### Optimizations

- **Internal Map**: Uses `Map` instead of plain object for guaranteed performance
- **Singleton**: Avoids re-parsing environment variables
- **No Processing**: Values stored as strings without automatic conversions

## Extensibility

### Adding New Variables

**Step 1:** Add to `.env.example`
```env
NEW_VARIABLE=
```

**Step 2:** Update `EnvConfig` interface in [config.service.ts](../../../apps/backend/src/config/config.service.ts)
```typescript
interface EnvConfig {
  // ... existing variables
  NEW_VARIABLE: string | null;
}
```

**Step 3:** Add to Map in ConfigService constructor
```typescript
constructor() {
  this.envConfig = new Map<ConfigKey, string | null>([
    // ... existing entries
    ['NEW_VARIABLE', process.env.NEW_VARIABLE ?? null],
  ]);
}
```

### Possible Future Extensions

1. **Schema Validation**
   ```typescript
   // Using class-validator or Joi
   validateConfig(): void {
     // Validate types, formats, required values
   }
   ```

2. **Transformation Methods**
   ```typescript
   getNumber(key: ConfigKey): number | null {
     const value = this.get(key);
     return value ? parseInt(value, 10) : null;
   }

   getBoolean(key: ConfigKey): boolean {
     const value = this.get(key);
     return value === 'true';
   }

   getArray(key: ConfigKey, separator = ','): string[] {
     const value = this.get(key);
     return value ? value.split(separator).map(v => v.trim()) : [];
   }
   ```

3. **Custom Default Values**
   ```typescript
   getOrDefault<K extends ConfigKey>(
     key: K,
     defaultValue: string
   ): string {
     return this.get(key) ?? defaultValue;
   }
   ```

4. **Namespace/Prefixes**
   ```typescript
   getNamespace(prefix: string): Record<string, string> {
     // Return all variables with specific prefix
   }
   ```

5. **Cache with TTL**
   ```typescript
   // For values that may change at runtime
   getCached(key: ConfigKey, ttl: number): string | null {
     // Implement cache with expiration
   }
   ```

## Troubleshooting

### Variable Not Found
**Problem:** `get()` returns `null` even with variable defined in `.env`

**Solutions:**
1. Check if `.env` file is in project root
2. Check if variable is in correct format: `NAME=value` (no spaces)
3. Restart server (dotenv is loaded only at startup)
4. Verify variable was added to `EnvConfig` and constructor

### ConfigService Not Available
**Problem:** Dependency injection error in some module

**Solution:** Verify that `ConfigModule` was imported in `AppModule`. As it's `@Global()`, it only needs to be imported there.

### Incorrect Types in Autocomplete
**Problem:** IDE doesn't suggest correct keys

**Solution:**
1. Check if TypeScript is updated
2. Restart TypeScript server in IDE
3. Verify if `ConfigKey` is exported correctly

## Security

### Best Practices

1. **Never commit `.env` file**
   - Use `.env.example` with empty values
   - Add `.env` to `.gitignore`

2. **Validate sensitive values**
   ```typescript
   if (!this.configService.has('TELEGRAM_BOT_TOKEN')) {
     throw new Error('Security: TELEGRAM_BOT_TOKEN must be set');
   }
   ```

3. **Don't log configuration values**
   ```typescript
   // ❌ DON'T DO
   console.log('DB URL:', this.configService.get('DATABASE_URL'));

   // ✅ DO
   console.log('DB connection configured:', this.configService.has('DATABASE_URL'));
   ```

4. **Use different `.env` per environment**
   - `.env.development`
   - `.env.production`
   - `.env.test`

## Conclusion

ConfigModule provides a solid and extensible foundation for configuration management, following NestJS best practices and maintaining type-safety throughout the application.

**Key benefits:**
- ✅ Type-safe with full autocomplete
- ✅ Singleton guaranteed by NestJS
- ✅ Global scope for ease of use
- ✅ Simple and intuitive interface
- ✅ Easy to test and mock
- ✅ Optimized performance
- ✅ Extensible for future needs
