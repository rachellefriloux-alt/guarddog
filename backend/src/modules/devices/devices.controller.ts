import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { Device } from '../../entities/device.entity';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(): Promise<Device[]> {
    return this.devices.findAll();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Device> {
    const device = await this.devices.findOne(id);
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device;
  }

  @Post()
  create(@Body() body: Partial<Device>): Promise<Device> {
    return this.devices.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<Device>,
  ): Promise<Device> {
    const updated = await this.devices.update(id, body);
    if (!updated) throw new NotFoundException(`Device ${id} not found`);
    return updated;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.devices.remove(id);
  }
}
