import { Injectable } from '@nestjs/common';
import { TwitchCommand, CommandPayload } from './command.interface';

@Injectable()
export class PingCommand implements TwitchCommand {
  name = 'ping';
  aliases = ['teste', 'latency'];

  async execute({ client, channel, user }: CommandPayload): Promise<void> {
    await client.say(channel, `Pong! 🏓 Olá @${user}`);
  }
}
