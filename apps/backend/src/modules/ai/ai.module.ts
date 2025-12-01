import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { AiService } from './ai.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
