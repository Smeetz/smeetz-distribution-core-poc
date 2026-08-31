import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module';
import { TiqetsController } from './tiqets.controller';

@Module({
  imports: [CoreModule],
  controllers: [TiqetsController],
})
export class TiqetsModule {}
