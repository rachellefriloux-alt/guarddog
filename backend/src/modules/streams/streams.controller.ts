// backend/src/modules/streams/streams.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { DevicesService } from '../devices/devices.service';

@Controller('api/streams')
export class StreamsController {
  constructor(
    private readonly streams: StreamsService,
    private readonly devices: DevicesService,
  ) {}

  // GET /api/streams/:id → returns HLS URL
  @Get(':id')
  async getStream(@Param('id') id: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      return { error: 'Invalid device id' };
    }

    const device = await this.devices.findOne(id);
    if (!device) {
      return { error: 'Device not found' };
    }

    if (!device.streamUrl) {
      return { error: 'Device has no streamUrl configured' };
    }

    const publicUrl = this.streams.start(id, device.streamUrl);
    return { hls: publicUrl };
  }

  // GET /api/streams → list active streams
  @Get()
  list() {
    return { active: this.streams.list() };
  }
}
