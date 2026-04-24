// backend/src/modules/streams/streams.module.ts
import { Module } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { StreamsController } from './streams.controller';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [DevicesModule],
  providers: [StreamsService],
  controllers: [StreamsController],
  exports: [StreamsService],
})
export class StreamsModule {}
