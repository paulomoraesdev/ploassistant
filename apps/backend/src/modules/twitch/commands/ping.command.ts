import { Injectable } from '@nestjs/common';
import { TwitchCommand, CommandPayload } from './command.interface';

/**
 * PingCommand - Simple test command for verifying bot responsiveness
 *
 * This command serves as a health check and example implementation of the
 * TwitchCommand interface. It responds with "Pong!" to demonstrate that
 * the bot is online and processing commands correctly.
 *
 * Usage in chat:
 * - !ping
 * - !teste (Portuguese alias)
 * - !latency (alternative name)
 *
 * This command is registered as a NestJS provider and injected into
 * TwitchCommandService during module initialization.
 *
 * @example
 * User: !ping
 * Bot: Pong! 🏓 Hello @username
 */
@Injectable()
export class PingCommand implements TwitchCommand {
  /** Primary command name */
  name = 'ping';

  /**
   * Command aliases for alternative invocation
   * 'teste' - Portuguese for 'test'
   * 'latency' - Alternative English name
   */
  aliases = ['teste', 'latency'];

  /**
   * Executes the ping command
   *
   * Sends a simple "Pong!" message to the chat mentioning the user.
   * This is a synchronous operation that completes immediately.
   *
   * @param payload - Command execution context
   * @param payload.client - ChatClient for sending response
   * @param payload.channel - Channel where command was invoked
   * @param payload.user - User who invoked the command
   */
  async execute({ client, channel, user }: CommandPayload): Promise<void> {
    await client.say(channel, `Pong! 🏓 Hello @${user}`);
  }
}
