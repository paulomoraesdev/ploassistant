import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '../../config/config.service';

/**
 * PrismaService - Database service providing Prisma ORM integration
 *
 * This service extends PrismaClient and implements NestJS lifecycle hooks
 * to manage database connections throughout the application lifecycle.
 * It integrates with ConfigService for environment-based configuration.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly configService: ConfigService) {
    // Validate DATABASE_URL exists
    if (!configService.has('DATABASE_URL')) {
      throw new Error(
        'DATABASE_URL environment variable is required for database connection. ' +
          'Please ensure it is set in your .env file or environment.',
      );
    }

    // Get connection string from ConfigService
    const connectionString = configService.get('DATABASE_URL')!;

    // Initialize PostgreSQL adapter
    const adapter = new PrismaPg({ connectionString });

    // Initialize PrismaClient with adapter
    super({ adapter });
  }

  /**
   * Lifecycle hook called when the NestJS module is initialized.
   * Establishes database connection.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Lifecycle hook called when the NestJS module is destroyed.
   * Gracefully closes database connection.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
