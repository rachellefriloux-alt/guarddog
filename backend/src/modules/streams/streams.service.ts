// backend/src/modules/streams/streams.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Injectable()
export class StreamsService implements OnModuleDestroy {
  private readonly log = new Logger(StreamsService.name);

  // Use a plain object map to avoid generic syntax issues in transport
  private processes: { [cameraId: string]: ChildProcessWithoutNullStreams } = {};

  // Restrict cameraId to a safe character set so it cannot escape the hls/ root
  // (e.g. via path traversal segments like ".." or absolute paths).
  private static readonly SAFE_ID = /^[A-Za-z0-9_-]+$/;

  private assertSafeId(cameraId: string): void {
    if (!StreamsService.SAFE_ID.test(cameraId)) {
      throw new Error(`Invalid cameraId: ${cameraId}`);
    }
  }

  private getHlsPath(cameraId: string): string {
    this.assertSafeId(cameraId);
    const dir = join(process.cwd(), 'hls', cameraId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, 'index.m3u8');
  }

  private getPublicUrl(cameraId: string): string {
    return `/hls/${cameraId}/index.m3u8`;
  }

  start(cameraId: string, inputUrl: string): string {
    this.assertSafeId(cameraId);
    if (this.processes[cameraId]) {
      return this.getPublicUrl(cameraId);
    }

    const outDir = join(process.cwd(), 'hls', cameraId);
    mkdirSync(outDir, { recursive: true });

    const args = [
      '-i', inputUrl,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '3',
      '-hls_flags', 'delete_segments',
      `${outDir}/index.m3u8`,
    ];

    this.log.log(`Starting HLS stream for ${cameraId}: ffmpeg ${args.join(' ')}`);

    const proc = spawn('ffmpeg', args);
    this.processes[cameraId] = proc;

    proc.stderr.on('data', (d) => {
      this.log.debug(`[${cameraId}] ${d.toString()}`);
    });

    proc.on('exit', (code) => {
      this.log.warn(`Stream for ${cameraId} exited with code ${code}`);
      delete this.processes[cameraId];
    });

    return this.getPublicUrl(cameraId);
  }

  stop(cameraId: string): void {
    const proc = this.processes[cameraId];
    if (proc) {
      this.log.warn(`Stopping stream for ${cameraId}`);
      proc.kill('SIGTERM');
      delete this.processes[cameraId];
    }
  }

  list(): string[] {
    return Object.keys(this.processes);
  }

  onModuleDestroy() {
    this.log.warn('Shutting down all active streams…');
    for (const cameraId of Object.keys(this.processes)) {
      const proc = this.processes[cameraId];
      this.log.warn(`Killing ffmpeg for ${cameraId}`);
      proc.kill('SIGTERM');
      delete this.processes[cameraId];
    }
  }
}
