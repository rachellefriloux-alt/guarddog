import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SnapshotsService } from './snapshots.service';
import { Snapshot } from '../../entities/snapshot.entity';

@Controller('snapshots')
export class SnapshotsController {
  constructor(private readonly snapshots: SnapshotsService) {}

  @Get()
  list(): Promise<Snapshot[]> {
    return this.snapshots.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Snapshot> {
    const snap = await this.snapshots.findOne(id);
    if (!snap) throw new NotFoundException(`Snapshot ${id} not found`);
    return snap;
  }

  @Post()
  create(@Body() body: Partial<Snapshot>): Promise<Snapshot> {
    return this.snapshots.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.snapshots.remove(id);
  }
}
