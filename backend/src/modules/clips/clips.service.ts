import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clip } from '../../entities/clip.entity';

@Injectable()
export class ClipsService {
  constructor(
    @InjectRepository(Clip)
    private readonly repo: Repository<Clip>,
  ) {}

  findAll(): Promise<Clip[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  findOne(id: string): Promise<Clip | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<Clip>): Promise<Clip> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.repo.delete({ id });
    return { deleted: (res.affected ?? 0) > 0 };
  }
}
