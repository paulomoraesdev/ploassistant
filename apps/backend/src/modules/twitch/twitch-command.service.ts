import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TwitchCommand, CommandPayload } from './commands/command.interface';
import { PingCommand } from './commands/ping.command';

@Injectable()
export class TwitchCommandService implements OnModuleInit {
  private readonly logger = new Logger(TwitchCommandService.name);
  private readonly PREFIX = '!'; // Prefixo dos comandos

  // Mapa para busca rápida O(1)
  private commands = new Map<string, TwitchCommand>();

  // Injetamos os comandos concretos aqui
  constructor(private readonly pingCommand: PingCommand) {}

  onModuleInit() {
    this.registerCommand(this.pingCommand);
  }

  private registerCommand(command: TwitchCommand) {
    this.commands.set(command.name, command);
    command.aliases?.forEach((alias) => this.commands.set(alias, command));
    this.logger.log(`Twitch Command registered: !${command.name}`);
  }

  async handleMessage(payload: CommandPayload) {
    const { message, user, channel } = payload;

    // 1. Verifica se é comando
    if (!message.startsWith(this.PREFIX)) {
      // TODO: Aqui entra a lógica de "Ler mensagem passiva" (Keyword spotting)
      // ex: this.handlePassiveMessage(payload);
      return;
    }

    // 2. Separa comando e argumentos
    const args = message.slice(this.PREFIX.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // 3. Busca o comando
    const command = this.commands.get(commandName);

    if (command) {
      try {
        this.logger.log(`Executing command !${commandName} for user ${user}`);
        await command.execute({ ...payload, args });
      } catch (error) {
        this.logger.error(`Error executing command !${commandName}`, error);
        await payload.client.say(
          channel,
          `@${user} Ops, tive um erro interno.`,
        );
      }
    }
  }
}
