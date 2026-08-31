import { Module } from '@nestjs/common';
import { GygModule } from './adapters/gyg/gyg.module';
import { TiqetsModule } from './adapters/tiqets/tiqets.module';

@Module({
  imports: [TiqetsModule, GygModule],
})
export class AppModule {}
