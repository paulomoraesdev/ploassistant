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
 * TwitchChatService - Manages Chat Interaction Logic
 *
 * Renamed from TwitchService to reflect its specific scope.
 * It consumes the injected ChatClient to listen to messages and route commands.
 */
@Injectable()
export class TwitchChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchChatService.name);

  constructor(
    @Inject(TWITCH_CHAT_CLIENT) private readonly chatClient: ChatClient | null,
    private readonly config: ConfigService,
    private readonly commandService: TwitchCommandService,
    private readonly eventService: TwitchEventService,
  ) {}

  onModuleInit() {
    if (!this.chatClient) {
      this.logger.warn(
        'Twitch Chat Service initialized without an active client (Auth missing?)',
      );
      return;
    }

    this.setupListeners();
  }

  onModuleDestroy() {
    if (this.chatClient) {
      this.logger.log('Disconnecting from Twitch chat...');
      this.chatClient.quit();
    }
  }

  /**
   * Exposes the client for other services if absolutely necessary,
   * though Injection is preferred.
   */
  public getClient(): ChatClient | null {
    return this.chatClient;
  }

  private setupListeners(): void {
    if (!this.chatClient) return;

    // --- MESSAGE HANDLER ---
    this.chatClient.onMessage((channel, user, message, msg) => {
      // 1. Ignore bot's own messages
      const isMe =
        user.toLowerCase() === this.config.get('TWITCH_CHANNEL')?.toLowerCase();
      if (isMe) return;

      this.logger.debug(`[${channel}] ${user}: ${message}`);

      // 2. Delegate to CommandService
      this.commandService.handleMessage({
        channel,
        user,
        message,
        args: [],
        client: this.chatClient!,
      });
    });

    // --- LEGACY EVENT HANDLERS (Fallback) ---
    // Kept here if you want to support events via Chat IRC as backup,
    // otherwise these can be fully moved to EventSub.

    this.chatClient.onAuthenticationFailure((text, retryCount) => {
      this.logger.error(`Auth failed (Attempt ${retryCount}): ${text}`);
    });
  }
}
