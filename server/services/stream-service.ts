import { spawn, ChildProcess } from 'child_process';
import { createWriteStream, createReadStream, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { storage } from '../storage';
import { type Camera, type InsertRecording } from '@shared/schema';

interface StreamInstance {
  process: ChildProcess;
  port: number;
  cameraId: string;
  isRecording: boolean;
  recordingPath?: string;
}

export class StreamService {
  private streams: Map<string, StreamInstance> = new Map();
  private recordingsDir = path.join(process.cwd(), 'recordings');
  private baseStreamPort = 9000;

  constructor() {
    // Ensure recordings directory exists
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true });
    }
  }

  async startStream(camera: Camera): Promise<{ streamUrl: string; hlsUrl: string } | null> {
    try {
      // Check if stream already exists
      if (this.streams.has(camera.id)) {
        const existing = this.streams.get(camera.id)!;
        return {
          streamUrl: `http://localhost:${existing.port}/stream`,
          hlsUrl: `http://localhost:${existing.port}/hls/${camera.id}.m3u8`
        };
      }

      const streamPort = this.baseStreamPort + this.streams.size;
      const outputDir = path.join(this.recordingsDir, camera.id);
      
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      let ffmpegProcess: ChildProcess;

      if (camera.type === 'ring') {
        // For Ring cameras, we'll use the Ring API to get the stream URL
        ffmpegProcess = await this.setupRingStream(camera, streamPort, outputDir);
      } else if (camera.type === 'esee') {
        // For ESEE cameras, use RTSP stream
        ffmpegProcess = await this.setupESEEStream(camera, streamPort, outputDir);
      } else {
        // Generic IP camera with RTSP
        ffmpegProcess = await this.setupGenericStream(camera, streamPort, outputDir);
      }

      if (!ffmpegProcess) {
        console.error(`Failed to start stream for camera ${camera.id}`);
        return null;
      }

      const streamInstance: StreamInstance = {
        process: ffmpegProcess,
        port: streamPort,
        cameraId: camera.id,
        isRecording: false,
      };

      this.streams.set(camera.id, streamInstance);

      // Handle process events
      ffmpegProcess.on('error', (error) => {
        console.error(`Stream error for camera ${camera.id}:`, error);
        this.stopStream(camera.id);
      });

      ffmpegProcess.on('exit', (code) => {
        console.log(`Stream process for camera ${camera.id} exited with code ${code}`);
        this.streams.delete(camera.id);
      });

      return {
        streamUrl: `http://localhost:${streamPort}/stream`,
        hlsUrl: `/api/stream/${camera.id}/hls/${camera.id}.m3u8`
      };

    } catch (error) {
      console.error(`Error starting stream for camera ${camera.id}:`, error);
      return null;
    }
  }

  private async setupESEEStream(camera: Camera, port: number, outputDir: string): Promise<ChildProcess> {
    const rtspUrl = this.buildRTSPUrl(camera);
    const hlsPath = path.join(outputDir, 'stream.m3u8');

    // FFmpeg command for ESEE RTSP stream
    const ffmpegArgs = [
      '-i', rtspUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments',
      '-hls_allow_cache', '0',
      hlsPath,
      // Also output to HTTP stream
      '-f', 'mjpeg',
      `http://localhost:${port}/stream`
    ];

    return spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  private async setupRingStream(camera: Camera, port: number, outputDir: string): Promise<ChildProcess> {
    // For Ring cameras, we would need to integrate with Ring API
    // For now, we'll use a placeholder that attempts to connect to Ring's stream
    // In production, you'd use the ring-client-api package properly
    
    const hlsPath = path.join(outputDir, 'stream.m3u8');

    // Placeholder FFmpeg command (would be replaced with actual Ring stream URL)
    const ffmpegArgs = [
      '-f', 'lavfi',
      '-i', `testsrc=size=${camera.resolution || '1920x1080'}:rate=30`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments',
      hlsPath
    ];

    return spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  private async setupGenericStream(camera: Camera, port: number, outputDir: string): Promise<ChildProcess> {
    const streamUrl = camera.streamUrl || this.buildRTSPUrl(camera);
    const hlsPath = path.join(outputDir, 'stream.m3u8');

    const ffmpegArgs = [
      '-i', streamUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments',
      '-hls_allow_cache', '0',
      hlsPath
    ];

    return spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  private buildRTSPUrl(camera: Camera): string {
    const auth = camera.username && camera.password 
      ? `${camera.username}:${camera.password}@` 
      : '';
    const port = camera.port || '554';
    
    // Common RTSP paths for different camera types
    let path = '/live';
    if (camera.type === 'esee') {
      path = '/cam/realmonitor?channel=1&subtype=0';
    }
    
    return `rtsp://${auth}${camera.ipAddress}:${port}${path}`;
  }

  async stopStream(cameraId: string): Promise<void> {
    const stream = this.streams.get(cameraId);
    if (stream) {
      if (stream.isRecording) {
        await this.stopRecording(cameraId);
      }
      stream.process.kill('SIGTERM');
      this.streams.delete(cameraId);
    }
  }

  async startRecording(cameraId: string): Promise<string | null> {
    const stream = this.streams.get(cameraId);
    if (!stream) {
      console.error(`No active stream found for camera ${cameraId}`);
      return null;
    }

    if (stream.isRecording) {
      console.log(`Recording already active for camera ${cameraId}`);
      return stream.recordingPath || null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${timestamp}.mp4`;
    const recordingPath = path.join(this.recordingsDir, cameraId, filename);

    // Update stream to include recording output
    stream.isRecording = true;
    stream.recordingPath = recordingPath;

    // In a production environment, you'd modify the FFmpeg process to also output to file
    // For now, we'll create a recording entry in the database
    const camera = await storage.getCamera(cameraId);
    if (camera) {
      const recording: InsertRecording = {
        cameraId,
        filename,
        duration: 0, // Will be updated when recording stops
        fileSize: 0, // Will be updated when recording stops
      };

      await storage.createRecording(recording);
    }

    return recordingPath;
  }

  async stopRecording(cameraId: string): Promise<void> {
    const stream = this.streams.get(cameraId);
    if (stream && stream.isRecording) {
      stream.isRecording = false;
      
      // In production, you'd stop the recording process and update the database
      // with final file size and duration
      
      stream.recordingPath = undefined;
    }
  }

  getStreamUrl(cameraId: string): string | null {
    const stream = this.streams.get(cameraId);
    return stream ? `http://localhost:${stream.port}/stream` : null;
  }

  getHLSUrl(cameraId: string): string | null {
    const stream = this.streams.get(cameraId);
    return stream ? `/api/stream/${cameraId}/hls/${cameraId}.m3u8` : null;
  }

  isStreamActive(cameraId: string): boolean {
    return this.streams.has(cameraId);
  }

  getAllActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  async cleanup(): Promise<void> {
    // Stop all active streams
    const cameraIds = Array.from(this.streams.keys());
    for (const cameraId of cameraIds) {
      await this.stopStream(cameraId);
    }
  }
}

export const streamService = new StreamService();

// Cleanup on process exit
process.on('SIGINT', async () => {
  console.log('Cleaning up streams...');
  await streamService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Cleaning up streams...');
  await streamService.cleanup();
  process.exit(0);
});