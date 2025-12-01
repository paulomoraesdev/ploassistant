import { Module } from '@nestjs/common';
import { TwitchController } from './twitch.controller';
import { TwitchAuthService } from './twitch-auth.service';
import { TwitchChatService } from './twitch-chat.service';
import { TwitchCommandService } from './twitch-command.service';
import { TwitchEventService } from './twitch-event.service';
import { TwitchEventSubService } from './twitch-eventsub.service';
import { PingCommand } from './commands/ping.command';

@Module({
  imports: [],
  controllers: [TwitchController],
  providers: [
    TwitchAuthService,
    TwitchChatService,
    TwitchCommandService,
    TwitchEventService,
    TwitchEventSubService,
    // Registra os comandos como providers
    PingCommand,
  ],
  exports: [TwitchChatService],
})
export class TwitchModule {}
