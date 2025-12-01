import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { TwitchAuthService } from './twitch-auth.service';
import { ApiClient } from '@twurple/api';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { TwitchEventService } from './twitch-event.service';
import { TWITCH_CHAT_CLIENT } from './twitch.provider';
import { ChatClient } from '@twurple/chat';

/**
 * TwitchEventSubService - Twitch EventSub WebSocket listener
 *
 * This service manages the Twitch EventSub WebSocket connection and registers
 * event subscriptions for various Twitch events (subscriptions, raids, follows, etc.).
 *
 * EventSub is Twitch's official event notification system that uses WebSockets for
 * real-time event delivery. It's more reliable than IRC-based event detection.
 *
 * Architecture:
 * - This service handles the EventSub infrastructure (connection, registration)
 * - TwitchEventService handles the business logic for each event
 * - ChatClient is injected and passed to event handlers for sending chat messages
 *
 * Events Currently Registered:
 * - Channel Subscriptions (new subs, resubs, gift subs)
 * - Channel Follows
 * - Channel Raids (incoming raids)
 * - Channel Point Redemptions
 *
 * @see TwitchEventService for event business logic implementation
 */
@Injectable()
export class TwitchEventSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchEventSubService.name);

  /**
   * Twitch API client for making API requests
   * Uses Definite Assignment Assertion (!) because it's initialized in onModuleInit
   */
  private apiClient!: ApiClient;

  /**
   * EventSub WebSocket listener instance
   * Uses Definite Assignment Assertion (!) because it's initialized in onModuleInit
   */
  private listener!: EventSubWsListener;

  /**
   * Creates an instance of TwitchEventSubService
   *
   * @param config - Configuration service for accessing environment variables
   * @param authService - Authentication service providing auth tokens
   * @param businessLogic - Event handler service containing business logic
   * @param chatClient - Injected ChatClient instance for sending messages to chat
   */
  constructor(
    private readonly config: ConfigService,
    private readonly authService: TwitchAuthService,
    private readonly businessLogic: TwitchEventService,
    @Inject(TWITCH_CHAT_CLIENT) private readonly chatClient: ChatClient,
  ) {}

  /**
   * NestJS lifecycle hook called when the module is initialized
   *
   * Initialization sequence:
   * 1. Wait for auth service to complete token loading
   * 2. Validate tokens are available
   * 3. Get broadcaster's user ID
   * 4. Create API client and EventSub listener
   * 5. Start WebSocket connection
   * 6. Register event subscriptions
   */
  async onModuleInit() {
    await this.authService.waitForInitialization();

    if (!this.authService.hasValidTokens()) {
      this.logger.warn('⚠️ EventSub not started: Invalid tokens.');
      return;
    }

    const authProvider = this.authService.getAuthProvider();

    // Explicit check to satisfy TypeScript
    if (!authProvider) {
      this.logger.error('⚠️ EventSub failed: AuthProvider is null.');
      return;
    }

    const userId = await this.getMyUserId(authProvider);

    if (!userId) return;

    this.apiClient = new ApiClient({ authProvider });

    this.listener = new EventSubWsListener({ apiClient: this.apiClient });

    this.listener.start();
    this.logger.log('✅ EventSub (WebSocket) Connected and listening for events.');

    this.registerEvents(userId);
  }

  /**
   * NestJS lifecycle hook called when the module is destroyed
   *
   * Gracefully stops the EventSub listener and closes WebSocket connection.
   */
  onModuleDestroy() {
    if (this.listener) {
      this.listener.stop();
    }
  }

  /**
   * Retrieves the broadcaster's Twitch user ID
   *
   * Uses the configured channel name to fetch the corresponding user ID,
   * which is required for EventSub subscription registration.
   *
   * @param authProvider - Authenticated provider for API requests
   * @returns The broadcaster's user ID, or null if not found
   * @private
   */
  private async getMyUserId(authProvider: any): Promise<string | null> {
    const apiClient = new ApiClient({ authProvider });
    const user = await apiClient.users.getUserByName(
      this.config.get('TWITCH_CHANNEL')!,
    );
    return user?.id || null;
  }

  /**
   * Registers all EventSub event subscriptions
   *
   * Sets up listeners for various Twitch events. When events are received,
   * they are logged and delegated to TwitchEventService for business logic handling.
   *
   * Currently registered events:
   * - Channel subscriptions (new subs, resubs, gift subs)
   * - Channel follows
   * - Channel raids (incoming)
   * - Channel point redemptions
   *
   * @param userId - The broadcaster's Twitch user ID
   * @private
   */
  private registerEvents(userId: string) {
    // --- SUBSCRIPTION ---
    this.listener.onChannelSubscription(userId, (event) => {
      this.logger.log(`🔔 EventSub: New sub from ${event.userName}`);

      void this.businessLogic.onSubscription(
        event.broadcasterName,
        event.userName,
        event as any,
        this.chatClient,
      );
    });

    // --- FOLLOW ---
    this.listener.onChannelFollow(userId, userId, (event) => {
      this.logger.log(`👤 EventSub: New follow from ${event.userName}`);
      // Future: this.businessLogic.onFollow(...)
    });

    // --- RAID ---
    this.listener.onChannelRaidTo(userId, (event) => {
      this.logger.log(
        `🚨 EventSub: Raid from ${event.raidingBroadcasterName} with ${event.viewers} viewers`,
      );

      void this.businessLogic.onRaid(
        event.raidedBroadcasterDisplayName,
        event.raidingBroadcasterName,
        { viewers: event.viewers },
        this.chatClient,
      );
    });

    // --- CHANNEL POINTS ---
    this.listener.onChannelRedemptionAdd(userId, (event) => {
      this.logger.log(
        `💎 Reward redeemed: ${event.rewardTitle} by ${event.userName}`,
      );
    });
  }
}