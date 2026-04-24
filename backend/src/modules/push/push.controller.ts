import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { PushService, isValidExpoPushToken } from './push.service';

interface RegisterDto {
  token?: unknown;
  deviceLabel?: unknown;
  cameraIds?: unknown;
}

interface UnregisterDto {
  token?: unknown;
}

interface TestDto {
  token?: unknown;
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post('register')
  register(@Body() body: RegisterDto) {
    if (!isValidExpoPushToken(body?.token)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    const cameraIds = Array.isArray(body.cameraIds)
      ? (body.cameraIds.filter((c) => typeof c === 'string') as string[])
      : undefined;
    const deviceLabel =
      typeof body.deviceLabel === 'string' ? body.deviceLabel : undefined;
    const sub = this.push.register({ token: body.token, deviceLabel, cameraIds });
    return { ok: true, token: sub.token, cameraIds: sub.cameraIds };
  }

  @Post('unregister')
  unregister(@Body() body: UnregisterDto) {
    if (typeof body?.token !== 'string') {
      throw new BadRequestException('token required');
    }
    const removed = this.push.unregister(body.token);
    return { ok: true, removed };
  }

  @Post('test')
  async test(@Body() body: TestDto) {
    if (!isValidExpoPushToken(body?.token)) {
      throw new BadRequestException('Invalid Expo push token');
    }
    return this.push.sendTest(body.token);
  }
}
