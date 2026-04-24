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

  @Get(':id')
  async getStream(@Param('id') id: string) {
    const device = await this.devices.findOne(id);
    if (!device) {
      return { error: 'Device not found' };
    }

    if (!device.streamUrl) {
      return { error: 'Device has no streamUrl configured' };
    }

    try {
      const publicUrl = this.streams.start(id, device.streamUrl);
      return { hls: publicUrl };
    } catch {
      return { error: 'Invalid device id' };
    }
  }

  @Get()
  list() {
    return { active: this.streams.list() };
  }
}
