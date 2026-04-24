import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EseecloudAdapter } from '../adapters/eseecloud/eseecloud.adapter';

@Controller('internal/devices')
export class InternalController {
  constructor(private readonly esee: EseecloudAdapter) {}

  @Get(':id/frame')
  async getFrame(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.esee.getFrame(id);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', buf.length.toString());
    res.send(buf);
  }
}
