import { config } from "dotenv";
// Load environment variables from .env file
config();

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { recognitionService } from "./services/recognition-service";
import { dailySummaryService } from "./services/daily-summary-service";
import { streamService } from "./services/stream-service";
import { sovereignRecorder, loadStreamsFromFile } from "./services/sovereign-recorder";
import { fileStorageService } from "./services/file-storage-service";
import { mqttEventsBridge } from "./services/mqtt-events-bridge";
import { getActiveProvider } from "./services/ai-provider-router";
import { sessionMiddleware } from "./session";

// Environment validation
function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === "production";
  const warnings: string[] = [];
  const errors: string[] = [];

  // Critical checks for production
  if (isProduction) {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "change-me-to-a-secure-random-string-in-production") {
      errors.push("SESSION_SECRET must be set to a secure random string in production. Generate one with: openssl rand -base64 32");
    }
    
    if (!process.env.GOOGLE_AUTH_CLIENT_ID || process.env.GOOGLE_AUTH_CLIENT_ID.includes("<") || process.env.GOOGLE_AUTH_CLIENT_ID.includes(">")) {
      warnings.push("GOOGLE_AUTH_CLIENT_ID is not configured. Google authentication will not work.");
    }
    
    if (!process.env.VITE_GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID.includes("<") || process.env.VITE_GOOGLE_CLIENT_ID.includes(">")) {
      warnings.push("VITE_GOOGLE_CLIENT_ID is not configured. Frontend Google authentication will not work.");
    }
  }

  // Non-critical warnings
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your-openai-api-key-here") {
    warnings.push("OPENAI_API_KEY is not configured. AI detection features will not work.");
  }

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL is not configured. Using in-memory storage (data will be lost on restart).");
  }

  // Log results
  if (errors.length > 0) {
    console.error("\n❌ CRITICAL CONFIGURATION ERRORS:");
    errors.forEach(err => console.error(`  - ${err}`));
    console.error("\nPlease fix these errors before running in production.\n");
    // Note: we no longer exit the process here. When packaged inside Electron the
    // window would never get a chance to render an error. Instead, log loudly and
    // continue with degraded functionality so operators can still reach the UI.
  }

  if (warnings.length > 0) {
    console.warn("\n⚠️  CONFIGURATION WARNINGS:");
    warnings.forEach(warn => console.warn(`  - ${warn}`));
    console.warn("\nSome features may not work correctly. See .env.example for configuration options.\n");
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ Environment configuration validated");
  }
}

// Validate environment on startup
validateEnvironment();

const app = express();

// Trust the first proxy hop (e.g. when running behind nginx / Caddy / Cloudflare).
// Required for express-rate-limit and secure cookies to work correctly behind a proxy.
app.set("trust proxy", 1);

// Security headers. CSP is intentionally disabled in development because Vite
// injects inline scripts and uses ws:// for HMR, both of which a strict CSP
// would block (causing a blank dev screen). In production we apply a strict
// policy that still allows Google Identity Services, Google Fonts, HLS streams,
// and data URIs. CodeQL flags the dev-mode "csp: false" — that is intentional
// and only takes effect when NODE_ENV !== "production".
const isProductionRuntime = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: isProductionRuntime
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              "https://accounts.google.com",
              "https://apis.google.com",
            ],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            mediaSrc: ["'self'", "blob:", "data:", "https:"],
            connectSrc: [
              "'self'",
              "https://accounts.google.com",
              "https://www.googleapis.com",
              "ws:",
              "wss:",
            ],
            frameSrc: ["'self'", "https://accounts.google.com"],
            objectSrc: ["'none'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  })
);

// Global rate limiter for the API surface. Protects login, upload, and stream endpoints
// from brute force and accidental thundering-herd. The static client and WebSocket
// are intentionally excluded.
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // generous - allows live polling but blocks runaway clients
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});
app.use("/api", apiRateLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[GuardDog] SESSION_SECRET is not set. Using a development fallback secret. " +
    "Set SESSION_SECRET in your environment for production deployments."
  );
}

app.use(sessionMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Add global error handlers
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });

    // Initialize AI services
    console.log('🤖 Initializing AI Recognition Service...');
    await recognitionService.initialize();

    // Probe and announce the active AI provider (free local Ollama, paid OpenAI, or disabled).
    const activeProvider = await getActiveProvider();
    console.log(`🧠 Active AI provider: ${activeProvider}`);
    
    console.log('📊 Setting up Daily Summary Service...');
    await dailySummaryService.scheduleDailySummary();

    // Clean up any orphaned video streams from a previous bad shutdown
    console.log('🧹 Preparing Stream Service...');
    await streamService.cleanup();

    // Sovereign recorder: bulk RTSP → segmented MP4 to a cloud-synced folder
    // (OneDrive by default). Only auto-starts when SOVEREIGN_STREAMS_FILE is
    // set, so existing deployments are unaffected.
    const sovereignStreams = loadStreamsFromFile();
    if (sovereignStreams.length > 0) {
      console.log(`🎞️  Starting sovereign recorder for ${sovereignStreams.length} stream(s) → ${sovereignRecorder.storagePath}`);
      sovereignRecorder.start(sovereignStreams);
    }

    // Schedule periodic cleanup of old recordings/snapshots/uploads.
    // Honors CLEANUP_OLDER_THAN_DAYS from .env (default: 30 days).
    const cleanupDays = Math.max(1, parseInt(process.env.CLEANUP_OLDER_THAN_DAYS || '30', 10) || 30);
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const runCleanup = () => {
      fileStorageService
        .cleanupOldFiles(cleanupDays)
        .catch((err) => console.error('Storage cleanup failed:', err));
    };
    runCleanup(); // Run once at startup
    setInterval(runCleanup, ONE_DAY_MS).unref();
    console.log(`🧽 Storage cleanup scheduled daily (files older than ${cleanupDays} days will be removed)`);

    // MQTT events bridge: subscribe to a local AI service (e.g. Frigate) and
    // record its detection events. Disabled unless MQTT_URL is set.
    if (mqttEventsBridge.isConfigured()) {
      console.log('📡 Starting MQTT events bridge...');
      mqttEventsBridge.start();
    }

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen({
      port,
      host: "localhost",
    }, () => {
      log(`🛡️  GuardDog Surveillance System serving on port ${port}`);
      log('🎥 Real camera streaming enabled');
      log('🤖 AI recognition and learning active');
      log('☁️  Google Drive integration ready');
      log('📊 Daily summary generation scheduled');
    });
  } catch (error) {
    console.error('Failed to start GuardDog server:', error);
  }
})();
