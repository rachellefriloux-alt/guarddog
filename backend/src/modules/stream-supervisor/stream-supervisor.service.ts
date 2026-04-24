// backend/src/modules/stream-supervisor/stream-supervisor.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { join } from 'path';
import { statSync, existsSync } from 'fs';
import { StreamsService } from '../streams/streams.service';

interface CameraHealth {
  isHealthy: boolean;
  lastSegmentTime: number | null;
  lastRestartTime: number | null;
  restartCount: number;
  reason: string | null;
}

@Injectable()
export class StreamSupervisorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(StreamSupervisorService.name);

  // Health state per camera (plain-object map to match the StreamsService style)
  private health: { [cameraId: string]: CameraHealth } = {};

  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private readonly streams: StreamsService) {}

  onModuleInit() {
    this.log.log('Stream Supervisor starting…');

    // Run every 5 seconds
    this.intervalHandle = setInterval(() => {
      this.checkAllStreams();
    }, 5000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private getSegmentTimestamp(cameraId: string): number | null {
    // Validate cameraId before using it in a filesystem path to avoid traversal.
    if (!StreamsService.isSafeId(cameraId)) return null;
    const hlsPath = join(process.cwd(), 'hls', cameraId, 'index.m3u8');
    if (!existsSync(hlsPath)) return null;

    try {
      const stats = statSync(hlsPath);
      return stats.mtimeMs;
    } catch {
      return null;
    }
  }

  private ensureHealth(cameraId: string): CameraHealth {
    if (!this.health[cameraId]) {
      this.health[cameraId] = {
        isHealthy: true,
        lastSegmentTime: null,
        lastRestartTime: null,
        restartCount: 0,
        reason: null,
      };
    }
    return this.health[cameraId];
  }

  private checkAllStreams() {
    const active = this.streams.list();

    for (const cameraId of active) {
      const h = this.ensureHealth(cameraId);
      const ts = this.getSegmentTimestamp(cameraId);

      if (ts === null) {
        h.isHealthy = false;
        h.reason = 'No HLS output found';
        continue;
      }

      const now = Date.now();
      const age = now - ts;

      h.lastSegmentTime = ts;

      // If no new segment in 10 seconds → restart
      if (age > 10000) {
        this.log.warn(`Stream stalled for ${cameraId}, restarting…`);
        this.streams.stop(cameraId);
        this.streams.start(cameraId, null); // StreamsService will reuse existing URL
        h.lastRestartTime = now;
        h.restartCount += 1;
        h.isHealthy = false;
        h.reason = 'Stalled stream (no new segments)';
        continue;
      }

      // Otherwise healthy
      h.isHealthy = true;
      h.reason = null;
    }
  }

  getAllHealth() {
    return this.health;
  }

  restart(cameraId: string) {
    const h = this.ensureHealth(cameraId);
    this.streams.stop(cameraId);
    this.streams.start(cameraId, null);
    h.lastRestartTime = Date.now();
    h.restartCount += 1;
    h.isHealthy = true;
    h.reason = 'Manual restart';
    return { ok: true };
  }
}
