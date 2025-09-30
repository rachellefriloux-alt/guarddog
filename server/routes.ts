import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { cameraService } from "./services/camera-service";
import { streamService } from "./services/stream-service";
import { fileStorageService } from "./services/file-storage-service";
import { googleDriveService } from "./services/google-drive-service";
import { recognitionService } from "./services/recognition-service";
import { dailySummaryService } from "./services/daily-summary-service";
import { insertCameraSchema, insertCloudFileSchema } from "@shared/schema";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const connectedClients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    console.log('WebSocket client connected');

    ws.on('close', () => {
      connectedClients.delete(ws);
      console.log('WebSocket client disconnected');
    });

    // Send initial data
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
  });

  // Broadcast function for real-time updates
  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Camera routes
  app.get("/api/cameras", async (req, res) => {
    try {
      const cameras = await storage.getCameras();
      res.json(cameras);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cameras" });
    }
  });

  app.get("/api/cameras/:id", async (req, res) => {
    try {
      const camera = await storage.getCamera(req.params.id);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      res.json(camera);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch camera" });
    }
  });

  app.post("/api/cameras", async (req, res) => {
    try {
      const validatedData = insertCameraSchema.parse(req.body);
      const camera = await storage.createCamera(validatedData);
      
      broadcast({ type: 'camera_added', camera });
      res.status(201).json(camera);
    } catch (error) {
      res.status(400).json({ 
        message: "Invalid camera data", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.patch("/api/cameras/:id", async (req, res) => {
    try {
      const updates = insertCameraSchema.partial().parse(req.body);
      const camera = await storage.updateCamera(req.params.id, updates);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      broadcast({ type: 'camera_updated', camera });
      res.json(camera);
    } catch (error) {
      res.status(400).json({ 
        message: "Invalid update data", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.delete("/api/cameras/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCamera(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Camera not found" });
      }

      // Stop stream if active
      await streamService.stopStream(req.params.id);

      broadcast({ type: 'camera_deleted', cameraId: req.params.id });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete camera" });
    }
  });

  // Camera streaming routes
  app.post("/api/cameras/:id/start-stream", async (req, res) => {
    try {
      const camera = await storage.getCamera(req.params.id);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const streamInfo = await streamService.startStream(camera);
      if (!streamInfo) {
        return res.status(500).json({ message: "Failed to start stream" });
      }

      broadcast({ type: 'stream_started', cameraId: camera.id, streamInfo });
      res.json(streamInfo);
    } catch (error) {
      res.status(500).json({ message: "Failed to start stream" });
    }
  });

  app.post("/api/cameras/:id/stop-stream", async (req, res) => {
    try {
      await streamService.stopStream(req.params.id);
      broadcast({ type: 'stream_stopped', cameraId: req.params.id });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to stop stream" });
    }
  });

  app.get("/api/cameras/:id/stream-status", async (req, res) => {
    try {
      const isActive = streamService.isStreamActive(req.params.id);
      const streamUrl = streamService.getStreamUrl(req.params.id);
      const hlsUrl = streamService.getHLSUrl(req.params.id);

      res.json({
        isActive,
        streamUrl,
        hlsUrl
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get stream status" });
    }
  });

  // Stream serving routes
  app.get("/api/stream/:cameraId/hls/:filename", async (req, res) => {
    try {
      const { cameraId, filename } = req.params;
      const filePath = path.join(process.cwd(), 'recordings', cameraId, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Stream file not found" });
      }

      // Set appropriate headers for HLS
      if (filename.endsWith('.m3u8')) {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
      } else if (filename.endsWith('.ts')) {
        res.set('Content-Type', 'video/mp2t');
      }

      res.sendFile(filePath);
    } catch (error) {
      res.status(500).json({ message: "Failed to serve stream file" });
    }
  });

  // Recording control routes
  app.post("/api/cameras/:id/start-recording", async (req, res) => {
    try {
      const recordingPath = await streamService.startRecording(req.params.id);
      if (!recordingPath) {
        return res.status(500).json({ message: "Failed to start recording" });
      }

      broadcast({ type: 'recording_started', cameraId: req.params.id });
      res.json({ message: "Recording started", path: recordingPath });
    } catch (error) {
      res.status(500).json({ message: "Failed to start recording" });
    }
  });

  app.post("/api/cameras/:id/stop-recording", async (req, res) => {
    try {
      await streamService.stopRecording(req.params.id);
      broadcast({ type: 'recording_stopped', cameraId: req.params.id });
      res.json({ message: "Recording stopped" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });

  // File download routes
  app.get("/api/recordings/:cameraId/:filename/download", async (req, res) => {
    try {
      const { cameraId, filename } = req.params;
      const filePath = await fileStorageService.getRecordingPath(cameraId, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Recording not found" });
      }

      res.download(filePath, filename);
    } catch (error) {
      res.status(500).json({ message: "Failed to download recording" });
    }
  });

  // Recording routes
  app.get("/api/recordings", async (req, res) => {
    try {
      const cameraId = req.query.cameraId as string;
      const recordings = await storage.getRecordings(cameraId);
      res.json(recordings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recordings" });
    }
  });

  app.post("/api/cameras/:id/start-recording", async (req, res) => {
    try {
      const success = await cameraService.startRecording(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const camera = await storage.getCamera(req.params.id);
      broadcast({ type: 'camera_recording_started', camera });
      res.json({ message: "Recording started" });
    } catch (error) {
      res.status(500).json({ message: "Failed to start recording" });
    }
  });

  app.post("/api/cameras/:id/stop-recording", async (req, res) => {
    try {
      const success = await cameraService.stopRecording(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const camera = await storage.getCamera(req.params.id);
      broadcast({ type: 'camera_recording_stopped', camera });
      res.json({ message: "Recording stopped" });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });

  // Detection routes
  app.get("/api/detections", async (req, res) => {
    try {
      const cameraId = req.query.cameraId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const detections = cameraId 
        ? await storage.getDetections(cameraId)
        : await storage.getRecentDetections(limit);
      
      res.json(detections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch detections" });
    }
  });

  app.post("/api/cameras/:id/analyze-feed", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ message: "Image data required" });
      }

      await cameraService.analyzeCameraFeed(req.params.id, imageBase64);
      res.json({ message: "Feed analysis completed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze feed" });
    }
  });

  // Cloud storage routes
  app.get("/api/cloud-files", async (req, res) => {
    try {
      const files = await storage.getCloudFiles();
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cloud files" });
    }
  });

  app.post("/api/cloud-files/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Use the file storage service to save the uploaded file
      const cloudFile = await fileStorageService.saveUploadedFile(req.file);

      broadcast({ type: 'file_uploaded', file: cloudFile });
      res.status(201).json(cloudFile);
    } catch (error) {
      res.status(400).json({ 
        message: "Failed to upload file", 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  app.delete("/api/cloud-files/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCloudFile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "File not found" });
      }

      broadcast({ type: 'file_deleted', fileId: req.params.id });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // System stats route
  app.get("/api/system/stats", async (req, res) => {
    try {
      const stats = await storage.getSystemStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system stats" });
    }
  });

  // Google Drive authentication routes
  app.get("/api/google-drive/auth-url", async (req, res) => {
    try {
      const authUrl = googleDriveService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to get auth URL" });
    }
  });

  app.post("/api/google-drive/auth", async (req, res) => {
    try {
      const { code } = req.body;
      const refreshToken = await googleDriveService.handleAuthCallback(code);
      
      if (refreshToken) {
        res.json({ success: true, message: "Google Drive connected successfully" });
      } else {
        res.status(400).json({ message: "Failed to authenticate with Google Drive" });
      }
    } catch (error) {
      res.status(500).json({ message: "Authentication error" });
    }
  });

  app.get("/api/google-drive/storage", async (req, res) => {
    try {
      const usage = await googleDriveService.getStorageUsage();
      res.json(usage);
    } catch (error) {
      res.status(500).json({ message: "Failed to get storage usage" });
    }
  });

  app.get("/api/google-drive/files", async (req, res) => {
    try {
      const { cameraId } = req.query;
      const files = await googleDriveService.listFiles(cameraId as string);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Failed to list files" });
    }
  });

  app.delete("/api/google-drive/files/:fileId", async (req, res) => {
    try {
      const success = await googleDriveService.deleteFile(req.params.fileId);
      if (success) {
        res.json({ message: "File deleted successfully" });
      } else {
        res.status(404).json({ message: "File not found or deletion failed" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // AI Recognition routes
  app.get("/api/recognition/stats", async (req, res) => {
    try {
      const stats = await recognitionService.getRecognitionStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recognition stats" });
    }
  });

  app.get("/api/recognition/people", async (req, res) => {
    try {
      const people = await storage.getPersonProfiles();
      res.json(people);
    } catch (error) {
      res.status(500).json({ message: "Failed to get people" });
    }
  });

  app.get("/api/recognition/animals", async (req, res) => {
    try {
      const animals = await storage.getAnimalProfiles();
      res.json(animals);
    } catch (error) {
      res.status(500).json({ message: "Failed to get animals" });
    }
  });

  app.get("/api/recognition/vehicles", async (req, res) => {
    try {
      const vehicles = await storage.getVehicles();
      res.json(vehicles);
    } catch (error) {
      res.status(500).json({ message: "Failed to get vehicles" });
    }
  });

  app.post("/api/recognition/people/:id/mark-known", async (req, res) => {
    try {
      const { name, trustLevel } = req.body;
      const success = await recognitionService.markPersonAsKnown(req.params.id, name, trustLevel);
      
      if (success) {
        broadcast({ type: 'person_marked_known', personId: req.params.id, name });
        res.json({ message: "Person marked as known" });
      } else {
        res.status(404).json({ message: "Person not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to mark person as known" });
    }
  });

  app.post("/api/recognition/animals/:id/mark-known", async (req, res) => {
    try {
      const { name, isPet } = req.body;
      const success = await recognitionService.markAnimalAsKnown(req.params.id, name, isPet);
      
      if (success) {
        broadcast({ type: 'animal_marked_known', animalId: req.params.id, name });
        res.json({ message: "Animal marked as known" });
      } else {
        res.status(404).json({ message: "Animal not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to mark animal as known" });
    }
  });

  // Daily Summary routes
  app.get("/api/daily-summary", async (req, res) => {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      const summary = await dailySummaryService.generateDailySummary(targetDate);
      
      if (summary) {
        res.json(summary);
      } else {
        res.status(404).json({ message: "No data available for this date" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to generate daily summary" });
    }
  });

  app.get("/api/weekly-summary", async (req, res) => {
    try {
      const summary = await dailySummaryService.getWeeklySummary();
      if (summary) {
        res.json(summary);
      } else {
        res.status(404).json({ message: "No weekly data available" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to get weekly summary" });
    }
  });

  app.get("/api/recognition/learning-progress", async (req, res) => {
    try {
      const progress = await dailySummaryService.getRecognitionLearningProgress();
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: "Failed to get learning progress" });
    }
  });

  app.get("/api/recognition/events", async (req, res) => {
    try {
      const events = await storage.getRecognitionEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recognition events" });
    }
  });

  // Simulate motion detection for demo purposes
  setInterval(async () => {
    try {
      const cameras = await storage.getCameras();
      for (const camera of cameras) {
        if (camera.isOnline && camera.aiDetectionEnabled) {
          await cameraService.simulateMotionDetection(camera.id);
        }
      }

      // Broadcast recent detections to connected clients
      const recentDetections = await storage.getRecentDetections(5);
      broadcast({ type: 'detections_update', detections: recentDetections });

      // Broadcast system stats update
      const stats = await storage.getSystemStats();
      broadcast({ type: 'stats_update', stats });
    } catch (error) {
      console.error('Error in simulation interval:', error);
    }
  }, 30000); // Every 30 seconds

  return httpServer;
}
