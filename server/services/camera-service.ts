import { storage } from "../storage";
import { openaiService } from "./openai-service";
import { type Camera, type InsertDetection } from "@shared/schema";

export class CameraService {
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
        }
      }
    } catch (error) {
      console.error(`Error analyzing camera feed for camera ${cameraId}:`, error);
    }
  }

  async startRecording(cameraId: string): Promise<boolean> {
    const camera = await storage.updateCamera(cameraId, { isRecording: true });
    return !!camera;
  }

  async stopRecording(cameraId: string): Promise<boolean> {
    const camera = await storage.updateCamera(cameraId, { isRecording: false });
    return !!camera;
  }

  async updateCameraStatus(cameraId: string, isOnline: boolean, wifiStrength?: number): Promise<void> {
    await storage.updateCamera(cameraId, { 
      isOnline, 
      ...(wifiStrength !== undefined && { wifiStrength })
    });
  }
}

export const cameraService = new CameraService();
