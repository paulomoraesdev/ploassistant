import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { ChatClient } from '@twurple/chat';
import { TwitchAuthService } from './twitch-auth.service';

/**
 * TwitchService - Manages Twitch chat client and message handling
 *
 * This service initializes the Twitch chat client on module startup (if authenticated),
 * connects to the configured channel, and listens to chat messages.
 * It integrates with TwitchAuthService for authentication.
 */
@Injectable()
export class TwitchService implements OnModuleInit, OnModuleDestroy {
  private chatClient: ChatClient | null = null;

  constructor(
    private readonly authService: TwitchAuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * NestJS lifecycle hook called when the module is initialized
   *
   * Automatically connects the bot to Twitch chat if valid tokens are available.
   * Logs a warning if not authenticated, prompting manual OAuth flow.
   */
  async onModuleInit(): Promise<void> {
    // Wait for TwitchAuthService to finish loading tokens
    await this.authService.waitForInitialization();

    if (!this.authService.hasValidTokens()) {
      console.warn(
        '[TwitchService] No valid tokens found. Please authenticate at /twitch/authenticate',
      );
      return;
    }

    this.initializeChat();
  }

  /**
   * NestJS lifecycle hook called when the module is destroyed
   *
   * Gracefully disconnects from Twitch chat to ensure clean shutdown.
   */
  onModuleDestroy(): void {
    if (this.chatClient) {
      console.log('[TwitchService] Disconnecting from Twitch chat...');
      this.chatClient.quit();
      this.chatClient = null;
    }
  }

  /**
   * Initializes ChatClient and connects to Twitch chat
   *
   * Creates a new ChatClient instance with the auth provider from TwitchAuthService,
   * connects to the configured channel, and sets up message listeners.
   */
  private initializeChat(): void {
    const authProvider = this.authService.getAuthProvider();
    const channel = this.config.get('TWITCH_CHANNEL');

    if (!authProvider) {
      console.error(
        '[TwitchService] Cannot initialize chat: auth provider not available',
      );
      return;
    }

    if (!channel) {
      console.error(
        '[TwitchService] Cannot initialize chat: TWITCH_CHANNEL not configured',
      );
      return;
    }

    try {
      // Create ChatClient with auth provider and channel
      this.chatClient = new ChatClient({
        authProvider,
        channels: [channel],
      });

      // Setup listeners before connecting
      this._setupListeners();

      // Connect to Twitch chat
      this.chatClient.connect();

      console.log(
        `[TwitchService] Successfully connected to channel: ${channel}`,
      );
    } catch (error) {
      console.error('[TwitchService] Failed to initialize chat:', error);
    }
  }

  /**
   * Sets up chat message listeners and event handlers
   *
   * Configures listeners for:
   * - Chat messages (logs user and message to console)
   * - Authentication success
   * - Authentication failures
   * - Disconnections
   */
  private _setupListeners(): void {
    if (!this.chatClient) {
      return;
    }

    // Listen to all chat messages
    this.chatClient.onMessage((_channel, user, message) => {
      console.log(user, message);
    });

    // Listen to authentication success
    this.chatClient.onAuthenticationSuccess(() => {
      console.log('[TwitchService] Chat authentication successful');
    });

    // Listen to authentication failures
    this.chatClient.onAuthenticationFailure((text, retryCount) => {
      console.error(
        `[TwitchService] Chat authentication failed (retry ${retryCount}):`,
        text,
      );
    });

    // Listen to disconnections
    this.chatClient.onDisconnect((manually, reason) => {
      if (manually) {
        console.log('[TwitchService] Manually disconnected from chat');
      } else {
        console.warn(
          '[TwitchService] Unexpectedly disconnected from chat:',
          reason,
        );
      }
    });
  }
}
