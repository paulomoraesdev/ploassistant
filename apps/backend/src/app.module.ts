import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { TwitchModule } from './modules/twitch/twitch.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [ConfigModule, DatabaseModule, TwitchModule, TelegramModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
