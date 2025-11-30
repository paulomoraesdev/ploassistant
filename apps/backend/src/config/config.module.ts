import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
// This is executed at module import time, before ConfigService is instantiated
dotenv.config();

/**
 * ConfigModule - Global configuration module for the application
 *
 * This module provides centralized access to environment variables through
 * the ConfigService. It is marked as @Global(), making ConfigService available
 * throughout the entire application without needing to import this module
 * in every feature module.
 *
 * Key features:
 * - Loads environment variables from .env file using dotenv
 * - Provides singleton ConfigService instance
 * - Global scope for application-wide availability
 * - Type-safe environment variable access
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
