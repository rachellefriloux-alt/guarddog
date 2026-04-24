// backend/src/modules/streams/streams.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Injectable()
export class StreamsService implements OnModuleDestroy {
  private readonly log = new Logger(StreamsService.name);

  // Using a plain object to avoid generics which break transport
  private processes: { [cameraId: string]: any } = {};

  // Remember the source URL each stream was started with so the supervisor
  // (or any caller) can restart with the same input. Cleared on stop/exit.
  private inputUrls: { [cameraId: string]: string } = {};

  // Restrict cameraId to a safe character set so it cannot escape the hls/ root
  // (e.g. via path traversal segments like ".." or absolute paths).
  private static readonly SAFE_ID = /^[A-Za-z0-9_-]+$/;

  static isSafeId(cameraId: string): boolean {
    return StreamsService.SAFE_ID.test(cameraId);
  }

  /** Returns the original input URL for a running stream, or undefined. */
  getInputUrl(cameraId: string): string | undefined {
    return this.inputUrls[cameraId];
  }

  /** Returns the running ffmpeg child process for a camera, or undefined. */
  getProcess(cameraId: string): any | undefined {
    return this.processes[cameraId];
  }

  /** Resolved on-disk directory for the camera's HLS output. */
  getHlsDir(cameraId: string): string {
    if (!StreamsService.SAFE_ID.test(cameraId)) {
      throw new Error('Invalid cameraId');
    }
    return join(process.cwd(), 'hls', cameraId);
  }

  /**
   * Stop and immediately restart a stream using the input URL it was originally
   * started with. Returns the public HLS URL, or undefined if the camera is not
   * currently tracked (no known input URL to restart from).
   */
  restart(cameraId: string): string | undefined {
    const url = this.inputUrls[cameraId];
    if (!url) return undefined;
    this.stop(cameraId);
    return this.start(cameraId, url);
  }

  private getHlsPath(cameraId: string): string {
    if (!StreamsService.SAFE_ID.test(cameraId)) {
      throw new Error('Invalid cameraId');
    }
    const dir = join(process.cwd(), 'hls', cameraId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, 'index.m3u8');
  }

  private getPublicUrl(cameraId: string): string {
    return `/hls/${cameraId}/index.m3u8`;
  }

  start(cameraId: string, inputUrl: string | null): string {
    // Validate the cameraId immediately and build the on-disk path right after
    // — no intermediate property reads in between — so CodeQL's
    // js/path-injection flow recognizes the regex as a sanitizer in scope.
    if (!StreamsService.SAFE_ID.test(cameraId)) {
      throw new Error('Invalid cameraId');
    }
    const outDir = join(process.cwd(), 'hls', cameraId);

    // Allow callers (e.g. the supervisor) to restart with the previously known
    // URL by passing null. Throws if there is no cached URL to fall back to.
    const resolvedUrl = inputUrl ?? this.inputUrls[cameraId];
    if (!resolvedUrl) {
      throw new Error(`No inputUrl provided or cached for ${cameraId}`);
    }

    if (this.processes[cameraId]) {
      return this.getPublicUrl(cameraId);
    }

    mkdirSync(outDir, { recursive: true });

    const args = [
      '-i', resolvedUrl,
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
    this.inputUrls[cameraId] = resolvedUrl;

    proc.stderr.on('data', (d: Buffer) => {
      this.log.debug(`[${cameraId}] ${d.toString()}`);
    });

    proc.on('exit', (code: number) => {
      this.log.warn(`Stream for ${cameraId} exited with code ${code}`);
      delete this.processes[cameraId];
      // Keep this.inputUrls[cameraId] so a supervisor restart can reuse it.
    });

    return this.getPublicUrl(cameraId);
  }

  stop(cameraId: string): void {
    const proc = this.processes[cameraId];
    if (proc) {
      this.log.warn(`Stopping stream for ${cameraId}`);
      proc.kill('SIGTERM');
      delete this.processes[cameraId];
      // Keep this.inputUrls[cameraId] so a supervisor restart can reuse it.
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
