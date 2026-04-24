// backend/src/modules/stream-supervisor/stream-supervisor.module.ts
import { Module } from '@nestjs/common';
import { StreamSupervisorService } from './stream-supervisor.service';
import { StreamSupervisorController } from './stream-supervisor.controller';
import { StreamsModule } from '../streams/streams.module';

@Module({
  imports: [StreamsModule],
  providers: [StreamSupervisorService],
  controllers: [StreamSupervisorController],
})
export class StreamSupervisorModule {}
