import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { TelegramService } from './telegram.service';

/**
 * TelegramModule - Module for Telegram Bot integration
 *
 * This module encapsulates the TelegramService and manages the integration
 * with the Telegram Bot API using the grammY library.
 *
 * It is marked as @Global() to allow the TelegramService (and its sendMessage capability)
 * to be injected into other modules (like TwitchModule) without needing
 * to import TelegramModule explicitly in every feature module.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
