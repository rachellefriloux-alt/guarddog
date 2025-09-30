import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { storage } from "./storage";
import { cameraService } from "./services/camera-service";
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

      broadcast({ type: 'camera_deleted', cameraId: req.params.id });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete camera" });
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

      const fileData = {
        filename: `${Date.now()}_${req.file.originalname}`,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size / (1024 * 1024), // Convert to MB
      };

      const validatedData = insertCloudFileSchema.parse(fileData);
      const cloudFile = await storage.createCloudFile(validatedData);

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
