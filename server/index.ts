import { config } from "dotenv";
// Load environment variables from .env file
config();

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { recognitionService } from "./services/recognition-service";
import { dailySummaryService } from "./services/daily-summary-service";
import { streamService } from "./services/stream-service";

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
    if (isProduction) {
      process.exit(1);
    }
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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const MemoryStore = createMemoryStore(session);

const sessionSecret = process.env.SESSION_SECRET || "guarddog-development-secret";

if (!process.env.SESSION_SECRET) {
  console.warn("[GuardDog] SESSION_SECRET is not set. Using a development fallback secret. Set SESSION_SECRET in your environment for production deployments.");
}

app.use(
  session({
    name: "guarddog.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 24 }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

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
    
    console.log('📊 Setting up Daily Summary Service...');
    await dailySummaryService.scheduleDailySummary();

    // Clean up any orphaned video streams from a previous bad shutdown
    console.log('🧹 Preparing Stream Service...');
    await streamService.cleanup();

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
