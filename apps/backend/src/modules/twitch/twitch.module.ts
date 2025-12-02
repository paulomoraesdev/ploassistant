import { Module } from '@nestjs/common';
import { TwitchController } from './twitch.controller';
import { TwitchAuthService } from './twitch-auth.service';
import { TwitchChatService } from './twitch-chat.service';
import { TwitchCommandService } from './twitch-command.service';
import { TwitchEventService } from './twitch-event.service';
import { PingCommand } from './commands/ping.command';
import { TwitchClientProvider } from './twitch.provider';

@Module({
  imports: [],
  controllers: [TwitchController],
  providers: [
    TwitchAuthService,
    TwitchChatService,
    TwitchCommandService,
    TwitchEventService,
    TwitchClientProvider,
    // Registra os comandos como providers
    PingCommand,
  ],
  exports: [TwitchChatService],
})
export class TwitchModule {}
