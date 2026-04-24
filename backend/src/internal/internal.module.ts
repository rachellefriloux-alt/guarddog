import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { EseecloudModule } from '../adapters/eseecloud/eseecloud.module';

@Module({
  imports: [EseecloudModule],
  controllers: [InternalController],
})
export class InternalModule {}
