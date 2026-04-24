// backend/src/modules/stream-supervisor/stream-supervisor.controller.ts
import { Controller, Get, Post, Param } from '@nestjs/common';
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
    return this.sup.restart(id);
  }
}
