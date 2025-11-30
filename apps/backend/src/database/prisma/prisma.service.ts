import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * PrismaService - Database service providing Prisma ORM integration
 *
 * This service extends PrismaClient and implements NestJS lifecycle hooks
 * to manage database connections throughout the application lifecycle.
 * It uses the DATABASE_URL environment variable and PostgreSQL adapter.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const adapter = new PrismaPg({ connectionString });
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
