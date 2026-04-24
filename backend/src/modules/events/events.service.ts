import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../../entities/event.entity';
import { AlertsGateway } from '../../ws/alerts.gateway';
import { PushService } from '../push/push.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly repo: Repository<EventEntity>,
    private readonly alerts: AlertsGateway,
    private readonly push: PushService,
  ) {}

  findAll(): Promise<EventEntity[]> {
    return this.repo.find({ order: { timestamp: 'DESC' }, take: 200 });
  }

  findOne(id: string): Promise<EventEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<EventEntity>): Promise<EventEntity> {
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    this.alerts.broadcast(saved);
    // Fire-and-forget push fan-out. Push delivery must not block event
    // persistence or the websocket broadcast.
    this.push
      .notify({
        eventId: saved.id,
        cameraId: saved.deviceId,
        type: saved.type,
        timestamp: saved.timestamp.toISOString(),
        thumbnailUrl: saved.metadata?.thumbnailUrl,
      })
      .catch((err: Error) =>
        this.logger.warn(`push notify failed for event ${saved.id}: ${err.message}`),
      );
    return saved;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.repo.delete({ id });
    return { deleted: (res.affected ?? 0) > 0 };
  }
}
