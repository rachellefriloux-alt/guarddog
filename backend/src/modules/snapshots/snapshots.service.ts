import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Snapshot } from '../../entities/snapshot.entity';

@Injectable()
export class SnapshotsService {
  constructor(
    @InjectRepository(Snapshot)
    private readonly repo: Repository<Snapshot>,
  ) {}

  findAll(): Promise<Snapshot[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  findOne(id: string): Promise<Snapshot | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<Snapshot>): Promise<Snapshot> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.repo.delete({ id });
    return { deleted: (res.affected ?? 0) > 0 };
  }
}
