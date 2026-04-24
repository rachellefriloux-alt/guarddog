import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { EventsService } from './events.service';
import { EventEntity } from '../../entities/event.entity';
import { EventDto, EventListResponse } from './event.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Timeline endpoint. Supports filtering by camera + ISO-8601 date range
   * and offset-based pagination, and returns a normalized DTO with
   * `thumbnailUrl` / `clipUrl` / `ai` fields the timeline UI can rely on.
   */
  @Get()
  list(
    @Query('cameraId') cameraId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<EventListResponse> {
    const paging = EventsService.normalizePaging(limit, offset);
    return this.events.listForApi({
      cameraId: typeof cameraId === 'string' && cameraId.length > 0 ? cameraId : undefined,
      from: EventsService.parseDate(from),
      to: EventsService.parseDate(to),
      limit: paging.limit,
      offset: paging.offset,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<EventDto> {
    const dto = await this.events.findOneDto(id);
    if (!dto) throw new NotFoundException(`Event ${id} not found`);
    return dto;
  }

  /** Stream the JPEG snapshot associated with an event, if any. */
  @Get(':id/thumbnail')
  async thumbnail(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const snap = await this.events.findSnapshotForEvent(id);
    if (!snap) throw new NotFoundException(`No snapshot for event ${id}`);
    const real = await EventsService.resolveMediaPath(snap.path);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    createReadStream(real).pipe(res);
  }

  /** Stream the MP4 clip associated with an event, if any. */
  @Get(':id/clip')
  async clip(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const clip = await this.events.findClipForEvent(id);
    if (!clip) throw new NotFoundException(`No clip for event ${id}`);
    const real = await EventsService.resolveMediaPath(clip.path);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'private, max-age=300');
    createReadStream(real).pipe(res);
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
