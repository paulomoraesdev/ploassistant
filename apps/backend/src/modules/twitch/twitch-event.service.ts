import { Injectable, Logger } from '@nestjs/common';
import { ChatClient } from '@twurple/chat';

@Injectable()
export class TwitchEventService {
  private readonly logger = new Logger(TwitchEventService.name);

  constructor() {}

  async onSubscription(
    channel: string,
    user: string,
    subInfo: any,
    client: ChatClient,
  ) {
    this.logger.log(`New Sub: ${user}`);
  }

  async onRaid(
    channel: string,
    user: string,
    raidInfo: any,
    client: ChatClient,
  ) {
    this.logger.log(`Raid from: ${user} (${raidInfo.viewers} viewers)`);
    await client.say(
      channel,
      `🚨 RAID DO @${user}! Sejam bem vindos! Temos ${raidInfo.viewers} pessoas chegando!`
    );
  }
}
