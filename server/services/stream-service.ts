import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { storage } from '../storage';
import { type Camera, type InsertRecording } from '@shared/schema';

interface StreamInstance {
  process: ChildProcess;
  cameraId: string;
  isRecording: boolean;
  hlsUrl: string;
  playlistPath: string;
  recordingPath?: string;
}

export class StreamService {
  private streams: Map<string, StreamInstance> = new Map();
  private recordingsDir = path.join(process.cwd(), 'recordings');

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
          streamUrl: '',
          hlsUrl: existing.hlsUrl
        };
      }

      const outputDir = path.join(this.recordingsDir, camera.id);
      
      if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
      }
      mkdirSync(outputDir, { recursive: true });

      const playlistFilename = `${camera.id}.m3u8`;
      const playlistPath = path.join(outputDir, playlistFilename);
      const segmentTemplate = path.join(outputDir, `${camera.id}_%03d.ts`);

      const normalizedPlaylistPath = this.normalizeForFfmpeg(playlistPath);
      const normalizedSegmentTemplate = this.normalizeForFfmpeg(segmentTemplate);

      let ffmpegProcess: ChildProcess;

      if (camera.type === 'ring') {
        // Pulled from Ring-MQTT bridge instead of fake test pattern
        ffmpegProcess = await this.setupRingStream(camera, normalizedPlaylistPath, normalizedSegmentTemplate);
      } else if (camera.type === 'esee') {
        // For ESEE cameras, use RTSP stream
        ffmpegProcess = await this.setupESEEStream(camera, normalizedPlaylistPath, normalizedSegmentTemplate);
      } else {
        // Generic IP camera with RTSP
        ffmpegProcess = await this.setupGenericStream(camera, normalizedPlaylistPath, normalizedSegmentTemplate);
      }

      if (!ffmpegProcess) {
        console.error(`Failed to start stream for camera ${camera.id}`);
        return null;
      }

      const streamInstance: StreamInstance = {
        process: ffmpegProcess,
        cameraId: camera.id,
        isRecording: false,
        hlsUrl: `/api/stream/${camera.id}/hls/${playlistFilename}`,
        playlistPath,
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

      ffmpegProcess.stderr?.on('data', (data) => {
        console.error(`FFmpeg stderr for camera ${camera.id}: ${data.toString()}`);
      });

      ffmpegProcess.stdout?.on('data', (data) => {
        console.log(`FFmpeg stdout for camera ${camera.id}: ${data.toString()}`);
      });

      return {
        streamUrl: '',
        hlsUrl: streamInstance.hlsUrl
      };

    } catch (error) {
      console.error(`Error starting stream for camera ${camera.id}:`, error);
      return null;
    }
  }

  private async setupESEEStream(camera: Camera, playlistPath: string, segmentTemplate: string): Promise<ChildProcess> {
    const rtspUrl = this.buildRTSPUrl(camera);

    // FFmpeg command for ESEE RTSP stream
    const ffmpegArgs = [
      '-loglevel', 'error',
      '-nostdin',
      '-y',
      '-i', rtspUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_allow_cache', '0',
      '-hls_segment_filename', segmentTemplate,
      playlistPath,
    ];

    return spawn(this.getFfmpegExecutable(), ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  private async setupRingStream(camera: Camera, playlistPath: string, segmentTemplate: string): Promise<ChildProcess> {
    // Pulling the actual feed from the local Ring-MQTT bridge running in the background
    const ringRtspUrl = process.env.RING_RTSP_URL || 'rtsp://127.0.0.1:8554/front_door';

    const ffmpegArgs = [
      '-loglevel', 'error',
      '-nostdin',
      '-y',
      '-i', ringRtspUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_allow_cache', '0',
      '-hls_segment_filename', segmentTemplate,
      playlistPath
    ];

    return spawn(this.getFfmpegExecutable(), ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  private async setupGenericStream(camera: Camera, playlistPath: string, segmentTemplate: string): Promise<ChildProcess> {
    const streamUrl = camera.streamUrl || this.buildRTSPUrl(camera);

    const ffmpegArgs = [
      '-loglevel', 'error',
      '-nostdin',
      '-y',
      '-i', streamUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_allow_cache', '0',
      '-hls_segment_filename', segmentTemplate,
      playlistPath
    ];

    return spawn(this.getFfmpegExecutable(), ffmpegArgs, {
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

    stream.isRecording = true;
    stream.recordingPath = recordingPath;

    const camera = await storage.getCamera(cameraId);
    if (camera) {
      const recording: InsertRecording = {
        cameraId,
        filename,
        duration: 0, 
        fileSize: 0, 
      };

      await storage.createRecording(recording);
    }

    return recordingPath;
  }

  async stopRecording(cameraId: string): Promise<void> {
    const stream = this.streams.get(cameraId);
    if (stream && stream.isRecording) {
      stream.isRecording = false;
      stream.recordingPath = undefined;
    }
  }

  getStreamUrl(cameraId: string): string | null {
    const stream = this.streams.get(cameraId);
    return stream ? '' : null;
  }

  getHLSUrl(cameraId: string): string | null {
    const stream = this.streams.get(cameraId);
    return stream ? stream.hlsUrl : null;
  }

  isStreamActive(cameraId: string): boolean {
    return this.streams.has(cameraId);
  }

  getAllActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  async cleanup(): Promise<void> {
    const cameraIds = Array.from(this.streams.keys());
    for (const cameraId of cameraIds) {
      await this.stopStream(cameraId);
    }
  }

  private getFfmpegExecutable(): string {
    return ffmpegPath ?? 'ffmpeg';
  }

  private normalizeForFfmpeg(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}

export const streamService = new StreamService();
