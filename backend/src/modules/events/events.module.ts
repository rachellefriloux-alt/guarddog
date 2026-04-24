import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from '../../entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { AlertsGateway } from '../../ws/alerts.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity])],
  controllers: [EventsController],
  providers: [EventsService, AlertsGateway],
  exports: [EventsService],
})
export class EventsModule {}
