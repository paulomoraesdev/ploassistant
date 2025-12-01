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
 * This service handles the complete lifecycle of the grammY bot instance, including
 * initialization, message handling, security enforcement, and graceful shutdown.
 *
 * Architecture Features:
 * - **Access Control List (ACL)**: Whitelist-based security for incoming/outgoing messages
 * - **API Throttling**: Automatic rate limit handling to prevent Telegram Flood Wait errors
 * - **Middleware Pipeline**: Security middleware → Error handling → Command routing
 * - **Type-Safe Configuration**: Integration with ConfigService for environment variables
 * - **Lifecycle Management**: Proper startup and shutdown hooks for bot instance
 *
 * Security Model:
 * - **Incoming Security**: Middleware blocks all requests from unauthorized user IDs
 * - **Outgoing Security**: sendMessage() enforces ACL before sending any message
 * - **O(1) Lookup**: Uses Set data structure for fast authorization checks
 * - **Fail-Safe**: Bot stops gracefully if token is missing or invalid
 *
 * Configuration Requirements:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather (required)
 * - AUTHORIZED_USER_IDS: Comma-separated list of allowed Telegram user IDs (required)
 *
 * Integration Points:
 * - TwitchModule: Can inject TelegramService to send Twitch notifications
 * - Other modules: Global module allows injection anywhere in the application
 *
 * @example
 * ```typescript
 * // Inject in another service
 * constructor(private readonly telegramService: TelegramService) {}
 *
 * // Send notification to authorized users
 * await this.telegramService.sendMessage(123456789, '🎉 Stream started!');
 * ```
 *
 * @see TelegramModule for module configuration and global scope
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  /** grammY Bot instance, null if initialization failed */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private bot: Bot | null = null;

  /**
   * Access Control List containing authorized Telegram user IDs
   *
   * Uses Set data structure for O(1) lookup performance when checking
   * authorization for incoming messages and outgoing notifications.
   *
   * Populated from AUTHORIZED_USER_IDS environment variable on module initialization.
   */
  private allowedChatIds: Set<number> = new Set();

  constructor(private readonly config: ConfigService) {}

  /**
   * NestJS lifecycle hook called when the module is initialized
   *
   * Initialization Flow:
   * 1. Load Access Control List (ACL) from environment variables
   * 2. Retrieve bot token from configuration
   * 3. Create grammY Bot instance
   * 4. Apply API throttler (MUST be first middleware to prevent rate limit errors)
   * 5. Setup security middleware (authorization checks)
   * 6. Setup command handlers and message listeners
   * 7. Start bot with startup notification
   *
   * Error Handling:
   * - Missing token: Logs error and returns without initializing bot
   * - Initialization failure: Logs error and bot remains null
   * - No authorized users: Logs warning, bot starts but ignores all messages
   *
   * API Throttler Configuration:
   * The throttler is applied BEFORE all other middleware to ensure all API calls
   * (including those in middleware and handlers) are automatically queued and
   * rate-limited according to Telegram's limits. This prevents 429 Flood Wait errors.
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

  /**
   * NestJS lifecycle hook called when the module is being destroyed
   *
   * Performs graceful shutdown of the Telegram bot:
   * - Stops accepting new updates from Telegram
   * - Completes processing of pending updates
   * - Closes bot connection cleanly
   *
   * This hook is called during:
   * - Application shutdown
   * - Hot module replacement (development)
   * - Process termination signals (SIGTERM, SIGINT)
   *
   * @returns Promise that resolves when bot is fully stopped
   */
  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      this.logger.log('Stopping Telegram Bot...');
      await this.bot.stop();
    }
  }

  /**
   * Sends a message to a specific chat/user with automatic security enforcement
   *
   * This is the main public method for sending Telegram messages. It enforces the
   * Access Control List (ACL) to prevent sending messages to unauthorized users.
   *
   * Security Features:
   * - **ACL Validation**: Checks if target chat ID is in allowedChatIds Set
   * - **Guard Clause**: Blocks unauthorized messages and logs security violation
   * - **Bot Instance Check**: Verifies bot is initialized before attempting to send
   *
   * Performance Features:
   * - **Automatic Throttling**: Benefits from apiThrottler applied in onModuleInit
   * - **Rate Limit Handling**: Automatically queues messages if Telegram limits reached
   * - **O(1) Authorization**: Fast Set lookup for ACL validation
   *
   * Error Handling:
   * - Bot not initialized: Logs warning and returns without sending
   * - Unauthorized target: Logs error with chat ID and blocks message
   * - Send failure: Logs error with details but doesn't throw
   *
   * Use Cases:
   * - Cross-module notifications (e.g., Twitch events to Telegram)
   * - Admin alerts and monitoring notifications
   * - Automated status updates to authorized users
   *
   * @param targetChatId - Telegram chat ID or user ID (string or number)
   * @param text - Message content (supports Markdown and HTML formatting)
   * @returns Promise that resolves when message is sent or rejected
   *
   * @example
   * ```typescript
   * // Send notification to authorized user
   * await this.telegramService.sendMessage(123456789, '🎉 Stream started!');
   *
   * // Send to multiple authorized users
   * for (const chatId of authorizedUsers) {
   *   await this.telegramService.sendMessage(chatId, 'System update completed');
   * }
   * ```
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
   * Loads and parses authorized user IDs from environment configuration
   *
   * Parsing Strategy:
   * 1. Reads AUTHORIZED_USER_IDS from ConfigService
   * 2. Splits string by comma separator
   * 3. Converts each value to number and trims whitespace
   * 4. Filters out invalid values (NaN and 0)
   * 5. Stores in Set for O(1) lookup performance
   *
   * Environment Variable Format:
   * ```env
   * AUTHORIZED_USER_IDS=123456789,987654321,555666777
   * ```
   *
   * Security Implications:
   * - If not configured: Bot will start but ignore ALL incoming messages
   * - Empty/invalid IDs: Filtered out automatically
   * - Duplicate IDs: Set data structure automatically deduplicates
   *
   * @private
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
   * Configures global security middleware for incoming message authorization
   *
   * This middleware implements a whitelist-based security model that blocks
   * all unauthorized users from interacting with the bot.
   *
   * Middleware Behavior:
   * - Executes on EVERY incoming update (messages, commands, callbacks, etc.)
   * - Extracts user ID from update context
   * - Checks user ID against allowedChatIds Set (O(1) lookup)
   * - Calls next() only if user is authorized
   * - Blocks and logs unauthorized access attempts
   *
   * Security Flow:
   * ```
   * Incoming Update
   *      ↓
   * Extract ctx.from.id
   *      ↓
   * Check allowedChatIds.has(userId)
   *      ↓
   * ┌─────────────┬─────────────┐
   * │ Authorized  │ Unauthorized│
   * │   next()    │  Block + Log│
   * └─────────────┴─────────────┘
   * ```
   *
   * Implementation Details:
   * - Runs before all command and message handlers
   * - Unauthorized users receive no response (silent blocking)
   * - All access attempts are logged for security monitoring
   *
   * @private
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
   * Configures error handling, command handlers, and message listeners
   *
   * This method sets up the bot's business logic layer including error handlers,
   * command routing, and message processing pipelines.
   *
   * Registered Handlers:
   *
   * 1. **Global Error Handler** (bot.catch):
   *    - Catches all unhandled errors from middleware and handlers
   *    - Handles GrammyError (API errors from Telegram)
   *    - Handles HttpError (network/connection errors)
   *    - Logs unknown errors for debugging
   *
   * 2. **Command Handler** (/ping):
   *    - Simple health check command
   *    - Returns "Pong! 🏓 (System Operational)"
   *    - Useful for testing bot responsiveness
   *
   * 3. **Text Message Handler** (message:text):
   *    - Logs all incoming text messages
   *    - Format: [Telegram] FirstName: message text
   *    - Useful for debugging and monitoring
   *
   * Handler Execution Order:
   * ```
   * Incoming Update
   *      ↓
   * Security Middleware (setupSecurityMiddleware)
   *      ↓
   * Error Handler Wrapper (bot.catch)
   *      ↓
   * Command Handlers (bot.command)
   *      ↓
   * Message Handlers (bot.on)
   * ```
   *
   * Error Handler Types:
   * - GrammyError: Invalid requests, permission issues, malformed data
   * - HttpError: Network failures, timeout, Telegram API unavailable
   * - Unknown: Unexpected errors in custom handler logic
   *
   * @private
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
