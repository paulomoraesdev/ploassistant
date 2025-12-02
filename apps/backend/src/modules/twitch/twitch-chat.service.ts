import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { ChatClient } from '@twurple/chat';
import { TwitchCommandService } from './twitch-command.service';
import { TwitchEventService } from './twitch-event.service';
import { TWITCH_CHAT_CLIENT } from './twitch.provider';

/**
 * TwitchChatService - Manages Twitch chat message handling and routing
 *
 * This service is responsible for listening to Twitch chat messages via the injected
 * ChatClient and routing them to appropriate handlers (commands, passive message processing).
 *
 * Architecture:
 * - Consumes ChatClient from TwitchClientProvider (factory provider)
 * - Routes messages to TwitchCommandService for command execution
 * - Filters out bot's own messages to prevent infinite loops
 * - Manages chat connection lifecycle (connect on init, disconnect on destroy)
 *
 * Note: Previously named TwitchService, renamed to reflect specific scope after
 * service separation (Auth, Chat, Command, Event, EventSub).
 *
 * @see TwitchClientProvider for ChatClient creation
 * @see TwitchCommandService for command routing
 */
@Injectable()
export class TwitchChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchChatService.name);

  /**
   * Creates an instance of TwitchChatService
   *
   * @param chatClient - ChatClient instance from factory provider (nullable if auth failed)
   * @param config - Configuration service for channel name and settings
   * @param commandService - Command routing service
   * @param eventService - Event handling service (currently unused, reserved for future IRC events)
   */
  constructor(
    @Inject(TWITCH_CHAT_CLIENT) private readonly chatClient: ChatClient | null,
    private readonly config: ConfigService,
    private readonly commandService: TwitchCommandService,
    private readonly eventService: TwitchEventService,
  ) {}

  /**
   * NestJS lifecycle hook called when the module is initialized
   *
   * Sets up chat message listeners if ChatClient is available.
   * If ChatClient is null (authentication failed), logs warning and skips setup.
   */
  onModuleInit() {
    if (!this.chatClient) {
      this.logger.warn(
        'Twitch Chat Service initialized without an active client (Auth missing?)',
      );
      return;
    }

    this.setupListeners();
  }

  /**
   * NestJS lifecycle hook called when the module is destroyed
   *
   * Gracefully disconnects from Twitch chat by calling quit() on ChatClient.
   */
  onModuleDestroy() {
    if (this.chatClient) {
      this.logger.log('Disconnecting from Twitch chat...');
      this.chatClient.quit();
    }
  }

  /**
   * Provides access to the ChatClient instance
   *
   * Exposes the client for services that need direct access.
   * Note: Direct injection via TWITCH_CHAT_CLIENT token is preferred over this method.
   *
   * @returns The ChatClient instance, or null if not initialized
   */
  public getClient(): ChatClient | null {
    return this.chatClient;
  }

  /**
   * Sets up chat message listeners and event handlers
   *
   * Configures listeners for:
   * - Incoming chat messages (routes to command service)
   * - Authentication failures (logs errors)
   *
   * Message Processing Flow:
   * 1. Receive message from Twitch chat
   * 2. Filter out bot's own messages (prevent loops)
   * 3. Log message to console (debug level)
   * 4. Route to CommandService for command detection and execution
   *
   * @private
   */
  private setupListeners(): void {
    if (!this.chatClient) return;

    // --- MESSAGE HANDLER ---
    this.chatClient.onMessage((channel, user, message) => {
      // 1. Ignore bot's own messages to prevent infinite loops
      const isMe =
        user.toLowerCase() ===
        this.config.get('TWITCH_BOT_NAME')?.toLowerCase();
      if (isMe) return;

      this.logger.debug(`[${channel}] ${user}: ${message}`);

      // 2. Delegate to CommandService for command routing
      void this.commandService.handleMessage({
        channel,
        user,
        message,
        args: [],
        client: this.chatClient!,
      });
    });

    // --- LEGACY EVENT HANDLERS (Fallback) ---
    // Kept here for potential IRC-based event support as backup.
    // Primary event handling is now done via EventSub (TwitchEventSubService).

    this.chatClient.onAuthenticationFailure((text, retryCount) => {
      this.logger.error(`Auth failed (Attempt ${retryCount}): ${text}`);
    });
  }
}
