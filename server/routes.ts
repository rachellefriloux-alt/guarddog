import type { Express } from "express";
import { createServer, type Server, type IncomingMessage } from "http";
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
import { ringAuthService } from "./services/ring-auth-service";
import { eseeCloudService } from "./services/esee-cloud-service";
import { insertCameraSchema, insertCloudFileSchema } from "@shared/schema";
import { googleAuthService } from "./services/google-auth-service";
import { getActiveProvider, analyzeMotion } from "./services/ai-provider-router";
import { localOcrService } from "./services/local-ocr-service";
import { getAlertPipeline } from "./services/alert-pipeline";
import { getCameraSupervisor } from "./adapters/supervisor-bootstrap";
import { sessionMiddleware } from "./session";
import { testUrl } from "./services/url-tester";
import { discoverOnvifDevices } from "./services/onvif-discovery";
import { cameraPresets } from "./services/camera-presets";
import { sovereignRecorder } from "./services/sovereign-recorder";
import { runDiagnostics } from "./services/diagnostics";
import { auditLog } from "./services/audit-log";
import { notificationService } from "./services/notification-service";
import { mintShareToken, verifyShareToken } from "./services/clip-share";
import { parseSmartRule, ruleMatches, type SmartRule } from "./services/smart-filter";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for real-time updates. We use noServer mode and run the
  // session middleware against the upgrade request so only authenticated users
  // can subscribe to motion events.
  const wss = new WebSocketServer({ noServer: true });

  const connectedClients = new Set<WebSocket>();

  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = request.url || "";
    if (!url.startsWith("/ws")) {
      socket.destroy();
      return;
    }

    // Run express-session against the upgrade request to populate request.session.
    // The session middleware only reads from req and writes to res.setHeader / cookies,
    // neither of which apply during a WS handshake — passing a no-op response is safe
    // and is the documented pattern for this use-case.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noopRes = { setHeader() {}, getHeader() {}, getHeaders() { return {}; }, end() {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessionMiddleware(request as any, noopRes, () => {
      const sessionUser = (request as unknown as { session?: { user?: unknown } })
        .session?.user;
      if (!sessionUser) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  });

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

  // Bridge supervisor lifecycle events onto the WebSocket so the Settings
  // → Camera supervisor panel (and any future per-camera health badges) can
  // refresh without polling. Only wires up when CAMERA_SUPERVISOR=true; with
  // the flag off `getCameraSupervisor()` returns null and we silently skip.
  // Each broadcast carries the cameraId so clients can scope the update.
  const supervisorForBroadcast = getCameraSupervisor();
  if (supervisorForBroadcast) {
    supervisorForBroadcast.on("camera.online", (cameraId: string) => {
      broadcast({ type: "supervisor_camera_online", cameraId });
    });
    supervisorForBroadcast.on("camera.offline", (cameraId: string, reason?: string) => {
      broadcast({ type: "supervisor_camera_offline", cameraId, reason });
    });
    supervisorForBroadcast.on("camera.health", (health: unknown) => {
      broadcast({ type: "supervisor_camera_health", health });
    });
  }

  // Authentication routes
  app.get("/api/auth/session", (req, res) => {
    if (req.session?.user) {
      return res.json({ authenticated: true, user: req.session.user });
    }

    res.json({ authenticated: false });
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      if (!googleAuthService.isConfigured()) {
        return res.status(503).json({ message: "Google login is not configured on the server." });
      }

      const { credential } = req.body || {};

      if (!credential || typeof credential !== "string") {
        return res.status(400).json({ message: "Google credential is required." });
      }

      const profile = await googleAuthService.verifyIdToken(credential);

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      req.session.user = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      res.json({ authenticated: true, user: req.session.user });
    } catch (error) {
      console.error("Google authentication error:", error);
      const message = error instanceof Error ? error.message : "Failed to verify Google credential.";
      res.status(401).json({ message });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    await new Promise<void>((resolve) => {
      req.session.destroy(() => resolve());
    });
    res.json({ authenticated: false });
  });

  // Development-only bypass login when Google auth is not configured
  app.post("/api/auth/dev-login", async (req, res) => {
    if (googleAuthService.isConfigured()) {
      return res.status(403).json({ message: "Dev login not allowed when Google auth is configured." });
    }

    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const devUser = {
      id: "dev-user-123",
      email: "dev@guarddog.local",
      name: "Development User",
      picture: null,
    };

    req.session.user = devUser;

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    res.json({ authenticated: true, user: devUser });
  });

  const unauthenticatedApiPaths = new Set([
    "/api/auth/google",
    "/api/auth/session",
    "/api/auth/logout",
    "/api/auth/dev-login",
  ]);

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) {
      return next();
    }

    if (unauthenticatedApiPaths.has(req.path)) {
      return next();
    }

    // Public share links — the signed token IS the auth.
    if (req.path.startsWith("/api/share/")) {
      return next();
    }

    if (req.session?.user) {
      return next();
    }

    return res.status(401).json({ message: "Authentication required" });
  });

  // ----- Free / local AI endpoints --------------------------------------------
  app.get("/api/ai/status", async (_req, res) => {
    try {
      const provider = await getActiveProvider();
      res.json({
        provider,
        ollama: {
          host: process.env.OLLAMA_HOST || "http://localhost:11434",
          visionModel: process.env.OLLAMA_VISION_MODEL || "llava",
          textModel: process.env.OLLAMA_TEXT_MODEL || "llama3.2",
        },
        openaiConfigured: Boolean(
          process.env.OPENAI_API_KEY &&
            process.env.OPENAI_API_KEY !== "your-openai-api-key-here"
        ),
        ocrEnabled: true,
      });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ---- Alert pipeline (Phase 2) ------------------------------------------
  // These endpoints expose the running AlertPipeline. They return 503 when
  // ALERTS_PIPELINE is not enabled, so the routes are always discoverable
  // but never confusingly silent.

  app.get("/api/alerts/status", (_req, res) => {
    const pipeline = getAlertPipeline();
    if (!pipeline) {
      return res.status(503).json({
        enabled: false,
        message: "Alert pipeline disabled. Set ALERTS_PIPELINE=true to enable.",
      });
    }
    res.json({
      enabled: true,
      digestIntervalMs: pipeline.mailer.getIntervalMs(),
      digestQueue: pipeline.dispatcher.getDigestSnapshot(),
      lastDispatch: pipeline.getLastDispatch(),
      lastDigestFailure: pipeline.mailer.lastFailure
        ? {
            at: pipeline.mailer.lastFailure.at,
            totalAlerts: pipeline.mailer.lastFailure.payload.totalAlerts,
          }
        : null,
    });
  });

  app.post("/api/alerts/digest/flush", async (_req, res) => {
    const pipeline = getAlertPipeline();
    if (!pipeline) {
      return res.status(503).json({
        ok: false,
        message: "Alert pipeline disabled. Set ALERTS_PIPELINE=true to enable.",
      });
    }
    try {
      const result = await pipeline.flushDigestNow();
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, message: (err as Error).message });
    }
  });

  // ---- Camera supervisor (Phase 2) ---------------------------------------
  // Surfaces real per-camera reachability: state (online/offline/connecting),
  // circuit-breaker position, consecutive failures, and the last successful
  // health probe. Returns 503 when CAMERA_SUPERVISOR is not enabled so the
  // route is always discoverable but never confusingly silent.

  app.get("/api/supervisor/status", (_req, res) => {
    const supervisor = getCameraSupervisor();
    if (!supervisor) {
      return res.status(503).json({
        enabled: false,
        message: "Camera supervisor disabled. Set CAMERA_SUPERVISOR=true to enable.",
      });
    }
    const cameras = supervisor.list();
    const counts = cameras.reduce(
      (acc, c) => {
        acc[c.state] = (acc[c.state] ?? 0) + 1;
        return acc;
      },
      { online: 0, offline: 0, connecting: 0 } as Record<string, number>,
    );
    res.json({
      enabled: true,
      total: cameras.length,
      counts,
      cameras,
    });
  });

  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const { image } = req.body || {};
      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "Body must include base64 'image'" });
      }
      const result = await analyzeMotion(image);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/ai/ocr", upload.single("image"), async (req, res) => {
    try {
      const buffer = req.file?.buffer;
      if (!buffer) {
        return res.status(400).json({ message: "Upload a single image file under 'image'" });
      }
      const result = await localOcrService.readImage(buffer);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ----- Camera onboarding helpers -----------------------------------------
  // Vendor URL templates so the UI can pre-fill the stream URL field once the
  // user picks a brand from the dropdown in the camera-add wizard.
  app.get("/api/cameras/vendor-presets", (_req, res) => {
    res.json({ presets: cameraPresets });
  });

  // Probe a stream URL with ffprobe so the UI can validate the camera before
  // saving it. Returns codec / resolution / fps / bitrate plus a bandwidth
  // advisory when the stream is too hot for typical home upload pipes.
  app.post("/api/cameras/test-url", async (req, res) => {
    try {
      const { url, username, password } = req.body || {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ message: "Body must include a 'url' string." });
      }
      const result = await testUrl({ url, username, password });
      auditLog.record({
        event: "camera.test_url",
        detail: `${url} → ${result.ok ? "ok" : `error: ${result.error ?? "unknown"}`}`,
        user: req.session?.user?.email,
        ip: req.ip,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ONVIF / WS-Discovery scan. Returns the list of cameras that responded to
  // a UDP multicast probe. Empty arrays are normal in sandboxed / firewalled
  // environments — the UI surfaces that gracefully.
  app.get("/api/cameras/discover", async (req, res) => {
    try {
      const devices = await discoverOnvifDevices();
      auditLog.record({
        event: "discovery.run",
        detail: `${devices.length} device(s) responded`,
        user: req.session?.user?.email,
        ip: req.ip,
      });
      res.json({ devices });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ----- Stream health -----------------------------------------------------
  // Drives the green/amber/red badges on the cameras page.
  app.get("/api/streams/health", (_req, res) => {
    res.json({ streams: sovereignRecorder.getHealth() });
  });

  // ----- go2rtc integration export ----------------------------------------
  // Generates a ready-to-paste go2rtc.yaml snippet for every saved camera so
  // operators can re-use the same feeds with HomeAssistant / Frigate.
  app.get("/api/integrations/go2rtc.yaml", async (_req, res) => {
    try {
      const cameras = await storage.getCameras();
      const lines: string[] = ["# Generated by GuardDog. Drop into go2rtc/config.yaml.", "streams:"];
      for (const camera of cameras) {
        const safeName = camera.name.replace(/[^A-Za-z0-9_-]+/g, "_") || camera.id;
        lines.push(`  ${safeName}: ${camera.streamUrl}`);
      }
      res.set("Content-Type", "text/yaml; charset=utf-8");
      res.send(lines.join("\n") + "\n");
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ----- Diagnostics -------------------------------------------------------
  app.get("/api/diagnostics", async (req, res) => {
    try {
      const report = await runDiagnostics();
      auditLog.record({
        event: "diagnostics.run",
        detail: `ok=${report.summary.ok} warn=${report.summary.warn} fail=${report.summary.fail}`,
        user: req.session?.user?.email,
      });
      res.json(report);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ----- Audit log ---------------------------------------------------------
  app.get("/api/audit-log", (req, res) => {
    const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    res.json({ entries: auditLog.list(limit) });
  });

  // ----- Notification fan-out ---------------------------------------------
  app.get("/api/notifications/channels", (_req, res) => {
    res.json({ channels: notificationService.getChannels() });
  });

  app.post("/api/notifications/test", async (req, res) => {
    const title = (req.body?.title as string) || "GuardDog test notification";
    const message = (req.body?.message as string) || "If you see this, your channels are wired up correctly.";
    const results = await notificationService.send({ title, message, level: "info" });
    res.json({ results });
  });

  // ----- Recording share links --------------------------------------------
  app.post("/api/recordings/:id/share", async (req, res) => {
    try {
      const recording = await storage.getRecording(req.params.id);
      if (!recording) return res.status(404).json({ message: "Recording not found" });
      const ttlDays = req.body?.ttlDays ? Number(req.body.ttlDays) : undefined;
      const token = mintShareToken(recording.id, ttlDays);
      auditLog.record({
        event: "recording.share",
        detail: `${recording.filename} (expires ${new Date(token.expiresAt).toISOString()})`,
        user: req.session?.user?.email,
        ip: req.ip,
      });
      res.json(token);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.get("/api/share/:token", async (req, res) => {
    const verification = verifyShareToken(req.params.token);
    if (!verification.ok || !verification.recordingId) {
      return res.status(403).json({ message: verification.error || "invalid token" });
    }
    try {
      const recording = await storage.getRecording(verification.recordingId);
      if (!recording) return res.status(404).json({ message: "Recording not found" });
      const filePath = await fileStorageService.getRecordingPath(recording.cameraId, recording.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not on disk" });
      res.download(filePath, recording.filename);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // ----- AI smart filters --------------------------------------------------
  // Convert a natural-language alert description into a structured rule using
  // the active AI provider, with a regex fallback when no provider is set up.
  app.post("/api/ai/smart-filter/parse", async (req, res) => {
    try {
      const prompt = req.body?.prompt;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ message: "Body must include a 'prompt' string." });
      }
      const result = await parseSmartRule(prompt);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Test a saved rule against a hypothetical event so the UI can show users
  // what their rule will and won't fire on.
  app.post("/api/ai/smart-filter/test", (req, res) => {
    try {
      const rule: SmartRule = req.body?.rule;
      const event = req.body?.event;
      if (!rule || !event) {
        return res.status(400).json({ message: "Provide both 'rule' and 'event'." });
      }
      res.json({ matches: ruleMatches(rule, event) });
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

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

  // Ring authentication routes
  app.get("/api/ring/status", async (req, res) => {
    try {
      const status = ringAuthService.getConnectionStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get Ring status" });
    }
  });

  app.post("/api/ring/auth", async (req, res) => {
    try {
      const { refreshToken, email, password } = req.body;

      if (refreshToken) {
        const result = await ringAuthService.authenticate(refreshToken);

        if (result.success) {
          broadcast({ type: 'ring_connected' });
          return res.json({ success: true, message: "Ring account connected successfully", email: result.email });
        }

        return res.status(400).json({
          success: false,
          message: result.error,
          requiresRefreshToken: true
        });
      }

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required"
        });
      }

      const result = await ringAuthService.startEmailAuthentication(email, password);

      if (result.success && result.requiresTwoFactor) {
        return res.json({
          success: true,
          requiresTwoFactor: true,
          pendingAuthId: result.pendingAuthId,
          message: result.message
        });
      }

      if (result.success) {
        broadcast({ type: 'ring_connected' });
        return res.json({
          success: true,
          message: result.message,
          email: result.email
        });
      }

      return res.status(400).json({
        success: false,
        message: result.error || 'Ring authentication failed'
      });
    } catch (error) {
      console.error('Ring authentication error:', error);
      res.status(500).json({ message: "Ring authentication failed" });
    }
  });

  app.post("/api/ring/auth/verify", async (req, res) => {
    try {
      const { pendingAuthId, twoFactorCode } = req.body;

      if (!pendingAuthId || !twoFactorCode) {
        return res.status(400).json({
          success: false,
          message: "Pending authentication ID and 2FA code are required"
        });
      }

      const result = await ringAuthService.submitTwoFactorCode(pendingAuthId, twoFactorCode);

      if (result.success) {
        broadcast({ type: 'ring_connected' });
        return res.json({
          success: true,
          message: "Ring account connected successfully",
          email: result.email
        });
      }

      return res.status(400).json({
        success: false,
        message: result.error,
        retryable: result.retryable
      });
    } catch (error) {
      console.error('Ring 2FA verification error:', error);
      res.status(500).json({ message: "Failed to verify Ring 2FA code" });
    }
  });

  app.post("/api/ring/disconnect", async (req, res) => {
    try {
      await ringAuthService.disconnect();
      broadcast({ type: 'ring_disconnected' });
      res.json({ message: "Ring account disconnected successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to disconnect Ring account" });
    }
  });

  app.get("/api/ring/devices", async (req, res) => {
    try {
      const devices = await ringAuthService.getDevices();
      res.json(devices);
    } catch (error) {
      res.status(500).json({ message: "Failed to get Ring devices" });
    }
  });

  app.get("/api/ring/devices/:deviceId/snapshot", async (req, res) => {
    try {
      const snapshot = await ringAuthService.getSnapshot(req.params.deviceId);
      
      if (snapshot) {
        res.set('Content-Type', 'image/jpeg');
        res.send(snapshot);
      } else {
        res.status(404).json({ message: "Snapshot not available" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to get snapshot" });
    }
  });

  // ESEE Camera management routes
  app.get("/api/esee-cameras/status", async (req, res) => {
    try {
      const status = eseeCloudService.getConnectionStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ESEE camera status" });
    }
  });

  app.post("/api/esee-cameras/add", async (req, res) => {
    try {
      const { ip, port, username, password, name } = req.body;
      
      if (!ip || !username || !password) {
        return res.status(400).json({ message: "IP address, username, and password are required" });
      }

      const camera = await eseeCloudService.addCamera(ip, port || 80, username, password, name);
      
      broadcast({ type: 'esee_camera_added', camera });
      res.json({ success: true, message: "ESEE camera added successfully", camera });
    } catch (error) {
      res.status(500).json({ message: "Failed to add ESEE camera", error: (error as Error).message });
    }
  });

  app.delete("/api/esee-cameras/:cameraId", async (req, res) => {
    try {
      const success = await eseeCloudService.removeCamera(req.params.cameraId);
      
      if (success) {
        broadcast({ type: 'esee_camera_removed', cameraId: req.params.cameraId });
        res.json({ message: "ESEE camera removed successfully" });
      } else {
        res.status(404).json({ message: "Camera not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to remove ESEE camera" });
    }
  });

  app.get("/api/esee-cameras", async (req, res) => {
    try {
      const cameras = await eseeCloudService.getCameras();
      res.json(cameras);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ESEE cameras" });
    }
  });

  app.get("/api/esee-cameras/:cameraId", async (req, res) => {
    try {
      const camera = await eseeCloudService.getCameraById(req.params.cameraId);
      
      if (camera) {
        res.json(camera);
      } else {
        res.status(404).json({ message: "Camera not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to get ESEE camera" });
    }
  });

  app.get("/api/esee-cameras/:cameraId/snapshot", async (req, res) => {
    try {
      const channelIndex = parseInt(req.query.channel as string) || 0;
      const snapshot = await eseeCloudService.getSnapshot(req.params.cameraId, channelIndex);
      
      if (snapshot) {
        res.set('Content-Type', 'image/jpeg');
        res.send(snapshot);
      } else {
        res.status(404).json({ message: "Snapshot not available" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to get snapshot" });
    }
  });

  app.post("/api/esee-cameras/test", async (req, res) => {
    try {
      const results = await eseeCloudService.testAllCameras();
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to test cameras" });
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

  app.post("/api/google-drive/disconnect", async (req, res) => {
    try {
      // Note: Google Drive service doesn't have a disconnect method yet
      // This would clear stored tokens
      broadcast({ type: 'google_drive_disconnected' });
      res.json({ message: "Google Drive disconnected successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to disconnect Google Drive" });
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

  // Demo motion simulator. Disabled by default — only runs when DEMO_MODE=true,
  // which is intended for screenshots / showcases when no real cameras are
  // attached. Real detections come from analyzeCameraFeed() (cloud or local AI)
  // or the MQTT events bridge (Frigate / ring-mqtt).
  if ((process.env.DEMO_MODE || "").toLowerCase() === "true") {
    console.log("⚠️  DEMO_MODE=true — generating simulated motion events every 30s");
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
  }

  return httpServer;
}
