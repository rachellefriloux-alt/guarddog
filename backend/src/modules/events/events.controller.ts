import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { EventEntity } from '../../entities/event.entity';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(): Promise<EventEntity[]> {
    return this.events.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<EventEntity> {
    const event = await this.events.findOne(id);
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  @Post()
  create(@Body() body: Partial<EventEntity>): Promise<EventEntity> {
    return this.events.create(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.events.remove(id);
  }
}
