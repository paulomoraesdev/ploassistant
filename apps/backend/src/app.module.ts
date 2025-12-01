import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { TwitchModule } from './modules/twitch/twitch.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TwitchModule,
    TelegramModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
