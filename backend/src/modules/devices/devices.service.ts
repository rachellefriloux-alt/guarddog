import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../../entities/device.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private readonly repo: Repository<Device>,
  ) {}

  findAll(): Promise<Device[]> {
    return this.repo.find();
  }

  findOne(id: string): Promise<Device | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(data: Partial<Device>): Promise<Device> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<Device>): Promise<Device | null> {
    await this.repo.update({ id }, data);
    return this.findOne(id);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.repo.delete({ id });
    return { deleted: (res.affected ?? 0) > 0 };
  }
}
