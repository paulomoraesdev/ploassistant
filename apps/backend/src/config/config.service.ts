import { Injectable } from '@nestjs/common';

/**
 * Interface defining all environment variables supported by the application.
 * All values are typed as string | null to handle missing environment variables gracefully.
 */
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

/**
 * Type representing valid configuration keys
 */
type ConfigKey = keyof EnvConfig;

/**
 * ConfigService - Singleton service for managing environment variables
 *
 * This service provides a type-safe, centralized way to access and manage
 * environment variables throughout the application. It follows the singleton
 * pattern through NestJS's default provider scope.
 */
@Injectable()
export class ConfigService {
  private readonly envConfig: Map<ConfigKey, string | null>;

  constructor() {
    // Initialize the Map with all environment variables
    this.envConfig = new Map<ConfigKey, string | null>([
      ['APP_NAME', process.env.APP_NAME ?? null],
      ['APP_PORT', process.env.APP_PORT ?? null],
      ['NODE_ENV', process.env.NODE_ENV ?? null],
      ['DATABASE_URL', process.env.DATABASE_URL ?? null],
      ['DIRECT_URL', process.env.DIRECT_URL ?? null],
      ['TELEGRAM_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN ?? null],
      ['AUTHORIZED_USER_IDS', process.env.AUTHORIZED_USER_IDS ?? null],
      ['TWITCH_CLIENT_ID', process.env.TWITCH_CLIENT_ID ?? null],
      ['TWITCH_CLIENT_SECRET', process.env.TWITCH_CLIENT_SECRET ?? null],
      ['TWITCH_CHANNEL', process.env.TWITCH_CHANNEL ?? null],
    ]);
  }

  /**
   * Retrieves the current value of a configuration key.
   *
   * @template K - The configuration key type
   * @param key - The configuration key to retrieve
   * @returns The value associated with the key, or null if not set
   */
  get<K extends ConfigKey>(key: K): EnvConfig[K] {
    return this.envConfig.get(key) as EnvConfig[K];
  }

  /**
   * Sets or overrides the value of a configuration key at runtime.
   *
   * @template K - The configuration key type
   * @param key - The configuration key to set
   * @param value - The new value for the key
   */
  set<K extends ConfigKey>(key: K, value: EnvConfig[K]): void {
    this.envConfig.set(key, value);
  }

  /**
   * Checks whether a configuration key has a defined value (not null or undefined).
   *
   * @param key - The configuration key to check
   * @returns true if the key has a value, false otherwise
   */
  has(key: ConfigKey): boolean {
    const value = this.envConfig.get(key);
    return value !== null && value !== undefined;
  }
}
