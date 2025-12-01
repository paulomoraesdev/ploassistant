import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TwitchCommand, CommandPayload } from './commands/command.interface';
import { PingCommand } from './commands/ping.command';

/**
 * TwitchCommandService - Command routing and execution service
 *
 * This service implements a command registry pattern with O(1) lookup performance.
 * It parses incoming chat messages, identifies commands by prefix, and routes them
 * to registered command handlers with support for aliases.
 *
 * Key Features:
 * - O(1) command lookup using Map data structure
 * - Command alias support (multiple names for same command)
 * - Automatic command registration on module initialization
 * - Extensible architecture for adding new commands
 * - Error handling with user-facing error messages
 *
 * @example
 * // To add a new command:
 * // 1. Create class implementing TwitchCommand interface
 * // 2. Add to module providers
 * // 3. Inject in constructor and register in onModuleInit
 */
@Injectable()
export class TwitchCommandService implements OnModuleInit {
  private readonly logger = new Logger(TwitchCommandService.name);

  /** Command prefix for identifying commands in chat messages */
  private readonly PREFIX = '!';

  /** Command registry using Map for O(1) lookup performance */
  private commands = new Map<string, TwitchCommand>();

  /**
   * Creates an instance of TwitchCommandService
   *
   * @param pingCommand - Example command implementation injected as provider
   */
  constructor(private readonly pingCommand: PingCommand) {}

  /**
   * NestJS lifecycle hook called when the module is initialized
   *
   * Registers all command instances that were injected via constructor.
   * Add new command registrations here when adding new commands.
   */
  onModuleInit() {
    this.registerCommand(this.pingCommand);
  }

  /**
   * Registers a command in the registry with all its aliases
   *
   * This method adds both the primary command name and all aliases to the Map,
   * allowing users to invoke commands using any registered name or alias.
   * Time Complexity: O(1) for primary name + O(n) for n aliases
   *
   * @param command - The TwitchCommand implementation to register
   * @private
   */
  private registerCommand(command: TwitchCommand) {
    this.commands.set(command.name, command);
    command.aliases?.forEach((alias) => this.commands.set(alias, command));
    this.logger.log(`Twitch Command registered: !${command.name}`);
  }

  /**
   * Handles incoming chat messages and routes commands to their executors
   *
   * This method:
   * 1. Checks if message starts with command prefix (!)
   * 2. Parses command name and arguments
   * 3. Looks up command in registry (O(1))
   * 4. Executes command with error handling
   *
   * Non-command messages are ignored (future: keyword spotting for passive messages)
   *
   * @param payload - Message payload containing channel, user, message text, and ChatClient
   */
  async handleMessage(payload: CommandPayload) {
    const { message, user, channel } = payload;

    // 1. Check if message is a command
    if (!message.startsWith(this.PREFIX)) {
      // TODO: Add passive message logic here (Keyword spotting)
      // Example: this.handlePassiveMessage(payload);
      return;
    }

    // 2. Separate command and arguments
    const args = message.slice(this.PREFIX.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // 3. Look up command in registry
    const command = this.commands.get(commandName);

    if (command) {
      try {
        this.logger.log(`Executing command !${commandName} for user ${user}`);
        await command.execute({ ...payload, args });
      } catch (error) {
        this.logger.error(`Error executing command !${commandName}`, error);
        await payload.client.say(
          channel,
          `@${user} Oops, I had an internal error.`,
        );
      }
    }
  }
}
