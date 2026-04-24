import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from '../../entities/event.entity';
import { Snapshot } from '../../entities/snapshot.entity';
import { Clip } from '../../entities/clip.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { AlertsGateway } from '../../ws/alerts.gateway';
import { PushModule } from '../push/push.module';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity, Snapshot, Clip]), PushModule],
  controllers: [EventsController],
  providers: [EventsService, AlertsGateway],
  exports: [EventsService],
})
export class EventsModule {}
