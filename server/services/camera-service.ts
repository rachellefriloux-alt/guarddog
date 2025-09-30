import { storage } from "../storage";
import { openaiService } from "./openai-service";
import { streamService } from "./stream-service";
import { fileStorageService } from "./file-storage-service";
import { type Camera, type InsertDetection } from "@shared/schema";

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
    // In a real implementation, this would capture a frame from the live stream
    // For now, we'll create a placeholder
    const timestamp = new Date().toISOString();
    console.log(`Snapshot captured for camera ${cameraId} at ${timestamp} (reason: ${reason})`);
    
    // In production, you would:
    // 1. Get current frame from the stream
    // 2. Save it using fileStorageService.saveSnapshot()
    // 3. Return the file path
    
    return null;
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
    // In production, you would use ffprobe or similar to test RTSP stream
    // For now, we'll simulate a connection test
    console.log(`Testing RTSP connection for ESEE camera ${camera.name} at ${camera.ipAddress}`);
    return Math.random() > 0.1; // 90% success rate simulation
  }

  private async testRingConnection(camera: Camera): Promise<boolean> {
    // In production, you would test Ring API connectivity
    console.log(`Testing Ring API connection for camera ${camera.name}`);
    return Math.random() > 0.05; // 95% success rate simulation
  }

  private async testGenericConnection(camera: Camera): Promise<boolean> {
    // Test generic IP camera connection
    console.log(`Testing generic camera connection for ${camera.name} at ${camera.ipAddress}`);
    return Math.random() > 0.2; // 80% success rate simulation
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
