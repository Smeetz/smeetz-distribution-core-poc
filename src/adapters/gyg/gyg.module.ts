import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module';
import { GygController } from './gyg.controller';

@Module({
  imports: [CoreModule],
  controllers: [GygController],
})
export class GygModule {}
