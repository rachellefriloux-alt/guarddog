// backend/src/modules/stream-supervisor/stream-supervisor.controller.ts
import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { StreamSupervisorService } from './stream-supervisor.service';

@Controller('api/stream-health')
export class StreamSupervisorController {
  constructor(private readonly sup: StreamSupervisorService) {}

  @Get()
  list() {
    return this.sup.getAllHealth();
  }

  @Post(':id/restart')
  restart(@Param('id') id: string) {
    try {
      return this.sup.restart(id);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}

