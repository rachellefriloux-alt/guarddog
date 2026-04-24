import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../../entities/event.entity';
import { AlertsGateway } from '../../ws/alerts.gateway';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly repo: Repository<EventEntity>,
    private readonly alerts: AlertsGateway,
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
    return saved;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.repo.delete({ id });
    return { deleted: (res.affected ?? 0) > 0 };
  }
}
