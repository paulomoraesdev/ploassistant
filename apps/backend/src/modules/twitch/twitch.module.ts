import { Module } from '@nestjs/common';
import { TwitchController } from './twitch.controller';
import { TwitchAuthService } from './twitch-auth.service';
import { TwitchService } from './twitch.service';

@Module({
  imports: [],
  controllers: [TwitchController],
  providers: [TwitchAuthService, TwitchService],
  exports: [TwitchService],
})
export class TwitchModule {}
