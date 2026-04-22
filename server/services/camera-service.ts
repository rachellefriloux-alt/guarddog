import { storage } from "../storage";
import { openaiService } from "./openai-service";
import { streamService } from "./stream-service";
import { fileStorageService } from "./file-storage-service";
import { ringAuthService } from "./ring-auth-service";
import { notificationService } from "./notification-service";
import { detectionToRouterEvent, getAlertPipeline } from "./alert-pipeline";
import { type Camera, type InsertDetection } from "@shared/schema";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export class CameraService {
  async initializeCamera(cameraId: string): Promise<boolean> {
    const camera = await storage.getCamera(cameraId);
    if (!camera) {
      return false;
    }

    // Start stream for the camera
    const streamInfo = await streamService.startStream(camera);
    if (streamInfo) {
      console.log(`Stream started for camera ${camera.name}: ${streamInfo.streamUrl}`);
      return true;
    }

    return false;
  }

  async simulateMotionDetection(cameraId: string): Promise<void> {
    const camera = await storage.getCamera(cameraId);
    if (!camera || !camera.aiDetectionEnabled) {
      return;
    }

    // Simulate random motion detection
    const shouldDetect = Math.random() < 0.3; // 30% chance of detection
    if (!shouldDetect) return;

    const detectionTypes = [];
    if (camera.detectPeople) detectionTypes.push('person');
    if (camera.detectPets) detectionTypes.push('pet');
    if (camera.detectVehicles) detectionTypes.push('vehicle');

    if (detectionTypes.length === 0) return;

    const randomType = detectionTypes[Math.floor(Math.random() * detectionTypes.length)] as 'person' | 'pet' | 'vehicle';
    const confidence = 0.8 + Math.random() * 0.2; // 80-100% confidence

    let description = '';
    let classification = '';

    switch (randomType) {
      case 'person':
        description = `Person detected at ${camera.location.replace('_', ' ')}`;
        classification = Math.random() > 0.5 ? 'Adult human' : 'Child';
        break;
      case 'pet':
        description = `Pet detected in ${camera.location.replace('_', ' ')}`;
        classification = Math.random() > 0.5 ? 'Cat' : 'Dog';
        break;
      case 'vehicle':
        description = `Vehicle detected in ${camera.location.replace('_', ' ')}`;
        classification = ['Sedan', 'SUV', 'Motorcycle', 'Bicycle'][Math.floor(Math.random() * 4)];
        break;
    }

    const detection: InsertDetection = {
      cameraId,
      recordingId: null,
      type: randomType,
      confidence,
      description,
      metadata: { classification }
    };

    await storage.createDetection(detection);

    // If this is a significant detection, save a snapshot
    if (confidence > 0.9) {
      await this.captureSnapshot(cameraId, `${randomType}_detection`);
    }
  }

  async analyzeCameraFeed(cameraId: string, imageBase64: string): Promise<void> {
    const camera = await storage.getCamera(cameraId);
    if (!camera || !camera.aiDetectionEnabled) {
      return;
    }

    try {
      const result = await openaiService.analyzeImageForMotion(imageBase64);
      
      if (result.detected) {
        // Check if this type of detection is enabled for this camera
        const isAllowed = 
          (result.type === 'person' && camera.detectPeople) ||
          (result.type === 'pet' && camera.detectPets) ||
          (result.type === 'vehicle' && camera.detectVehicles);

        if (isAllowed) {
          const detection: InsertDetection = {
            cameraId,
            recordingId: null,
            type: result.type,
            confidence: result.confidence,
            description: result.description,
            metadata: result.metadata
          };

          await storage.createDetection(detection);

          // Save snapshot for high-confidence detections
          if (result.confidence > 0.8) {
            const imageBuffer = Buffer.from(imageBase64, 'base64');
            await fileStorageService.saveSnapshot(cameraId, imageBuffer);
          }

          // Fan out to user-configured notification sinks (no-op when none
          // are configured). Always non-blocking.
          if (result.type === 'person' || result.type === 'vehicle') {
            void notificationService
              .send({
                title: `${result.type === 'person' ? 'Person' : 'Vehicle'} on ${camera.name}`,
                message: result.description,
                level: result.type === 'person' ? 'alert' : 'info',
                meta: { cameraId, type: result.type, confidence: result.confidence },
              })
              .catch((err) => console.error('[CameraService] notification send failed:', err));
          }

          // Phase 2: also feed the alert pipeline. No-op when disabled.
          const pipeline = getAlertPipeline();
          if (pipeline) {
            const event = detectionToRouterEvent({
              cameraId,
              type: result.type,
              description: result.description,
            });
            if (event) pipeline.ingest(event);
          }
        }
      }
    } catch (error) {
      console.error(`Error analyzing camera feed for camera ${cameraId}:`, error);
    }
  }

  async startRecording(cameraId: string): Promise<boolean> {
    const recordingPath = await streamService.startRecording(cameraId);
    if (recordingPath) {
      await storage.updateCamera(cameraId, { isRecording: true });
      return true;
    }
    return false;
  }

  async stopRecording(cameraId: string): Promise<boolean> {
    await streamService.stopRecording(cameraId);
    await storage.updateCamera(cameraId, { isRecording: false });
    return true;
  }

  async captureSnapshot(cameraId: string, reason: string = 'manual'): Promise<string | null> {
    const camera = await storage.getCamera(cameraId);
    if (!camera || !camera.streamUrl) {
      console.warn(`captureSnapshot: camera ${cameraId} has no stream URL`);
      return null;
    }

    const tmpFile = path.join(
      os.tmpdir(),
      `guarddog-snap-${cameraId}-${Date.now()}.jpg`
    );

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(camera.streamUrl)
          .inputOptions(["-rtsp_transport", "tcp"])
          .outputOptions(["-frames:v", "1", "-q:v", "2", "-y"])
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .save(tmpFile);
      });

      const buffer = await fs.promises.readFile(tmpFile);
      const savedPath = await fileStorageService.saveSnapshot(cameraId, buffer);
      console.log(
        `Snapshot captured for camera ${cameraId} (reason: ${reason}) → ${savedPath}`
      );
      return savedPath;
    } catch (err) {
      console.error(`captureSnapshot failed for ${cameraId}:`, err);
      return null;
    } finally {
      await fs.promises.unlink(tmpFile).catch(() => {
        /* file may not exist if ffmpeg failed; ignore */
      });
    }
  }

  async updateCameraStatus(cameraId: string, isOnline: boolean, wifiStrength?: number): Promise<void> {
    await storage.updateCamera(cameraId, { 
      isOnline, 
      ...(wifiStrength !== undefined && { wifiStrength })
    });

    // If camera goes offline, stop its stream
    if (!isOnline) {
      await streamService.stopStream(cameraId);
    }
  }

  async testCameraConnection(camera: Camera): Promise<boolean> {
    try {
      // For ESEE cameras, test RTSP connection
      if (camera.type === 'esee') {
        return await this.testRTSPConnection(camera);
      }
      
      // For Ring cameras, test API connection
      if (camera.type === 'ring') {
        return await this.testRingConnection(camera);
      }

      // For generic cameras, test basic connectivity
      return await this.testGenericConnection(camera);
    } catch (error) {
      console.error(`Error testing camera connection for ${camera.id}:`, error);
      return false;
    }
  }

  private async testRTSPConnection(camera: Camera): Promise<boolean> {
    if (!camera.streamUrl) return false;
    return new Promise<boolean>((resolve) => {
      // ffprobe will return metadata for a working RTSP stream within ~5s,
      // or error out for an unreachable / unauthenticated one.
      const timer = setTimeout(() => resolve(false), 7000);
      ffmpeg.ffprobe(camera.streamUrl, ["-rtsp_transport", "tcp"], (err) => {
        clearTimeout(timer);
        if (err) {
          console.warn(`RTSP probe failed for ${camera.name}: ${err.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  private async testRingConnection(camera: Camera): Promise<boolean> {
    // Connection health for Ring cameras = ring-client-api session is alive.
    // The shared ringAuthService tracks session state.
    const ok = ringAuthService.isConnected();
    if (!ok) {
      console.warn(`Ring connection check failed for ${camera.name}: not authenticated`);
    }
    return ok;
  }

  private async testGenericConnection(camera: Camera): Promise<boolean> {
    if (!camera.ipAddress) return false;
    const port = parseInt(camera.port || "554", 10) || 554;
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const cleanup = (result: boolean) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(3000);
      socket.once("connect", () => cleanup(true));
      socket.once("timeout", () => cleanup(false));
      socket.once("error", () => cleanup(false));
      socket.connect(port, camera.ipAddress);
    });
  }

  async getAllCameraStatuses(): Promise<{ [cameraId: string]: boolean }> {
    const cameras = await storage.getCameras();
    const statuses: { [cameraId: string]: boolean } = {};

    for (const camera of cameras) {
      statuses[camera.id] = streamService.isStreamActive(camera.id);
    }

    return statuses;
  }
}

export const cameraService = new CameraService();
