import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GygModule } from './adapters/gyg/gyg.module';
import { TiqetsModule } from './adapters/tiqets/tiqets.module';

@Module({
  controllers: [HealthController],
  imports: [TiqetsModule, GygModule],
})
export class AppModule {}
