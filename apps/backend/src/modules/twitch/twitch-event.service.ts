import { Injectable, Logger } from '@nestjs/common';
import { ChatClient } from '@twurple/chat';

/**
 * TwitchEventService - Business logic for Twitch events
 *
 * This service contains the business logic handlers for various Twitch events
 * received via EventSub (subscriptions, raids, follows, etc.).
 *
 * It is separated from TwitchEventSubService to maintain clean separation of concerns:
 * - TwitchEventSubService: Manages EventSub WebSocket connection and registration
 * - TwitchEventService: Contains the actual business logic for handling events
 *
 * This pattern allows for easier testing and modification of event handling logic
 * without touching the EventSub infrastructure code.
 */
@Injectable()
export class TwitchEventService {
  private readonly logger = new Logger(TwitchEventService.name);

  constructor() {}

  /**
   * Handles channel subscription events
   *
   * Called when a user subscribes to the channel. This method can be extended
   * to send chat messages, save to database, send notifications, etc.
   *
   * @param channel - The channel where the subscription occurred
   * @param user - The username of the subscriber
   * @param subInfo - Subscription information (tier, is gift, etc.)
   * @param client - ChatClient instance for sending messages to chat
   */
  async onSubscription(
    channel: string,
    user: string,
    subInfo: any,
    client: ChatClient,
  ) {
    this.logger.log(`New Sub: ${user}`);
    // TODO: Add welcome message, database storage, notifications, etc.
  }

  /**
   * Handles incoming raid events
   *
   * Called when another channel raids this channel. Sends a welcome message
   * to chat thanking the raiding streamer and their viewers.
   *
   * @param channel - The channel being raided (this channel)
   * @param user - The username of the raiding streamer
   * @param raidInfo - Raid information including viewer count
   * @param client - ChatClient instance for sending messages to chat
   */
  async onRaid(
    channel: string,
    user: string,
    raidInfo: any,
    client: ChatClient,
  ) {
    this.logger.log(`Raid from: ${user} (${raidInfo.viewers} viewers)`);
    await client.say(
      channel,
      `🚨 RAID FROM @${user}! Welcome everyone! We have ${raidInfo.viewers} people arriving!`
    );
  }

  // TODO: Add onFollow, onCheer, onChannelPoints, and other event handlers as needed
}
