import { ChatClient } from '@twurple/chat';

/**
 * CommandPayload - Data structure passed to command executors
 *
 * Contains all contextual information needed for a command to execute,
 * including the message context, parsed arguments, and chat client for responses.
 *
 * This payload is created by TwitchCommandService when a command is detected
 * and passed to the command's execute() method.
 */
export interface CommandPayload {
  /** The Twitch channel where the command was invoked */
  channel: string;

  /** The username of the user who invoked the command */
  user: string;

  /** The full original message text (including command prefix and args) */
  message: string;

  /** Parsed command arguments (split by whitespace, command name removed) */
  args: string[];

  /** ChatClient instance for sending responses to the chat */
  client: ChatClient;
}

/**
 * TwitchCommand - Interface for implementing Twitch chat commands
 *
 * All commands must implement this interface to be registered in the command system.
 * Commands are registered as NestJS providers and injected into TwitchCommandService.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyCommand implements TwitchCommand {
 *   name = 'mycommand';
 *   aliases = ['mc', 'cmd'];
 *
 *   async execute({ client, channel, user, args }: CommandPayload): Promise<void> {
 *     await client.say(channel, `Hello @${user}! Args: ${args.join(', ')}`);
 *   }
 * }
 * ```
 *
 * @see PingCommand for a complete implementation example
 * @see TwitchCommandService for command registration logic
 */
export interface TwitchCommand {
  /** Primary command name (without prefix). Example: 'ping' for !ping */
  name: string;

  /** Optional alternative names for the command. Example: ['p', 'test'] */
  aliases?: string[];

  /**
   * Command execution logic
   *
   * This method is called when the command is invoked in chat.
   * It receives the full command context and should handle the command's logic,
   * send responses to chat, interact with databases, call APIs, etc.
   *
   * @param payload - Command context including channel, user, arguments, and client
   * @returns Promise that resolves when command execution is complete
   * @throws Should handle own errors or allow TwitchCommandService to catch and log them
   */
  execute(payload: CommandPayload): Promise<void>;
}
