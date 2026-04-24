import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Device } from './entities/device.entity';
import { EventEntity } from './entities/event.entity';
import { Clip } from './entities/clip.entity';
import { Snapshot } from './entities/snapshot.entity';

import { DevicesModule } from './modules/devices/devices.module';
import { EventsModule } from './modules/events/events.module';
import { ClipsModule } from './modules/clips/clips.module';
import { SnapshotsModule } from './modules/snapshots/snapshots.module';

import { EseecloudModule } from './adapters/eseecloud/eseecloud.module';
import { RingModule } from './adapters/ring/ring.module';
import { InternalModule } from './internal/internal.module';
import { AlertsGateway } from './ws/alerts.gateway';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_URL || 'guarddog.db',
      entities: [Device, EventEntity, Clip, Snapshot],
      synchronize: true,
    }),
    DevicesModule,
    EventsModule,
    ClipsModule,
    SnapshotsModule,
    EseecloudModule,
    RingModule,
    InternalModule,
  ],
  providers: [AlertsGateway],
  exports: [AlertsGateway],
})
export class AppModule {}
