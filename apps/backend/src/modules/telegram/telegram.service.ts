/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { Bot, GrammyError, HttpError } from 'grammy';
import { apiThrottler } from '@grammyjs/transformer-throttler';

/**
 * TelegramService - Manages Telegram Bot interactions, security, and stability
 *
 * This service handles the lifecycle of the grammY bot instance.
 *
 * Key features:
 * - Access Control List (ACL) for Incoming/Outgoing security.
 * - API Throttling: Automatically handles rate limits to prevent Flood Wait errors.
 * - Type-safe integration with ConfigService.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private bot: Bot | null = null;

  /**
   * Set of authorized User IDs for O(1) access time complexity.
   */
  private allowedChatIds: Set<number> = new Set();

  constructor(private readonly config: ConfigService) {}

  /**
   * NestJS lifecycle hook called when the module is initialized.
   */
  onModuleInit(): void {
    // 1. Load ACL
    this.loadAllowedUsers();

    // 2. Retrieve Token
    const token = this.config.get('TELEGRAM_BOT_TOKEN');

    if (!token) {
      this.logger.error('❌ TELEGRAM_BOT_TOKEN is missing in configuration');
      return;
    }

    try {
      this.bot = new Bot(token);

      // 3. Setup Throttler (Flood Control)
      // This MUST be applied before any other middleware or logic.
      // It wraps the API caller to queue requests if limits are reached.
      const throttler = apiThrottler();
      this.bot.api.config.use(throttler);

      // 4. Setup Security (Middlewares)
      this.setupSecurityMiddleware();

      // 5. Setup Logic (Handlers)
      this.setupHandlers();

      // 6. Start Bot
      this.bot.start({
        onStart: (botInfo) => {
          const startupMessage = `✅ Telegram Bot started as @${botInfo.username}`;
          this.logger.log(startupMessage);
          // this.allowedChatIds.forEach((chatId) => {
          //   void this.sendMessage(chatId, startupMessage);
          // });
        },
      });
    } catch (error) {
      this.logger.error('Failed to initialize grammY', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      this.logger.log('Stopping Telegram Bot...');
      await this.bot.stop();
    }
  }

  /**
   * Sends a message to a specific chat/user, enforcing security rules.
   * This method automatically benefits from the Throttler configured in onModuleInit.
   *
   * @param targetChatId - The ID of the user or chat.
   * @param text - The content of the message.
   */
  async sendMessage(
    targetChatId: string | number,
    text: string,
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn(
        '⚠️ Attempted to send message while bot is not initialized.',
      );
      return;
    }

    const chatIdNum = Number(targetChatId);

    // Guard Clause: Verify outgoing permission
    if (!this.allowedChatIds.has(chatIdNum)) {
      this.logger.error(
        `⛔ Blocked outgoing message to unauthorized ChatID: ${chatIdNum}`,
      );
      return;
    }

    try {
      await this.bot.api.sendMessage(chatIdNum, text);
      this.logger.debug(`📤 Message sent to ${chatIdNum}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatIdNum}`, error);
    }
  }

  /**
   * Parses the AUTHORIZED_USER_IDS environment variable.
   */
  private loadAllowedUsers(): void {
    const rawIds = this.config.get('AUTHORIZED_USER_IDS');

    if (!rawIds) {
      this.logger.warn(
        '⚠️ NO AUTHORIZED USERS CONFIGURED. The bot will ignore all interactions.',
      );
      return;
    }

    const ids = rawIds
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => !isNaN(id) && id !== 0);

    this.allowedChatIds = new Set(ids);
  }

  /**
   * Configures the global security middleware.
   */
  private setupSecurityMiddleware(): void {
    if (!this.bot) return;

    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const isAllowed = userId && this.allowedChatIds.has(userId);

      if (isAllowed) {
        await next();
      } else {
        this.logger.warn(
          `⛔ Unauthorized access attempt from UserID: ${userId} (ChatID: ${chatId})`,
        );
      }
    });
  }

  /**
   * Configures message handlers and commands.
   */
  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.catch((err) => {
      const ctx = err.ctx;
      this.logger.error(`Error while handling update ${ctx.update.update_id}:`);
      const e = err.error;

      if (e instanceof GrammyError) {
        this.logger.error(`Error in request: ${e.description}`);
      } else if (e instanceof HttpError) {
        this.logger.error(`Could not contact Telegram: ${e}`);
      } else {
        this.logger.error(`Unknown error: ${e}`);
      }
    });

    this.bot.command('ping', async (ctx) => {
      await ctx.reply('Pong! 🏓 (System Operational)');
    });

    this.bot.on('message:text', (ctx) => {
      const user = ctx.from.first_name;
      const text = ctx.message.text;
      this.logger.log(`[Telegram] ${user}: ${text}`);
    });
  }
}
