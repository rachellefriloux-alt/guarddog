import { Injectable } from '@nestjs/common';

/**
 * Ring adapter stub.
 *
 * In production this adapter wraps `ring-mqtt` to subscribe to motion / ding
 * events and to discover RTSP stream URLs that are persisted on the matching
 * Device record. PR 3 will replace this stub with the full integration.
 */
@Injectable()
export class RingAdapter {
  async listDevices(): Promise<Array<{ key: string; rtspUrl: string }>> {
    return [];
  }
}
