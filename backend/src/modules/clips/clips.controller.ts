import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ClipsService } from './clips.service';
import { Clip } from '../../entities/clip.entity';

@Controller('clips')
export class ClipsController {
  constructor(private readonly clips: ClipsService) {}

  @Get()
  list(): Promise<Clip[]> {
    return this.clips.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Clip> {
    const clip = await this.clips.findOne(id);
    if (!clip) throw new NotFoundException(`Clip ${id} not found`);
    return clip;
  }

  @Post()
  create(@Body() body: Partial<Clip>): Promise<Clip> {
    return this.clips.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clips.remove(id);
  }
}
