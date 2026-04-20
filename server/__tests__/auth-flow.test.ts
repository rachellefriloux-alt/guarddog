import express from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import request from "supertest";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { registerRoutes } from "../routes";
import { googleAuthService } from "../services/google-auth-service";

const MemoryStore = createMemoryStore(session);

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      name: "guarddog.sid",
      secret: "test-session-secret",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 1000 * 60 * 60,
      },
    })
  );

  const server = await registerRoutes(app);

  return { app, server };
};

describe("Google authentication flow", () => {
  let app: express.Express;
  let httpServer: import("http").Server;

  beforeEach(async () => {
    process.env.GOOGLE_AUTH_CLIENT_ID = "test-client-id";
    const built = await buildApp();
    app = built.app;
    httpServer = built.server;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    vi.restoreAllMocks();
  });

  it("requires authentication for protected routes and allows Google login", async () => {
    const agent = request.agent(app);

    await agent.get("/api/cameras").expect(401);

    vi.spyOn(googleAuthService, "isConfigured").mockReturnValue(true);
    vi.spyOn(googleAuthService, "verifyIdToken").mockResolvedValue({
      id: "123",
      email: "user@example.com",
      name: "Test User",
      picture: "https://example.com/avatar.png",
    });

    const loginResponse = await agent
      .post("/api/auth/google")
      .send({ credential: "fake-token" })
      .expect(200);

    expect(loginResponse.body).toMatchObject({
      authenticated: true,
      user: {
        id: "123",
        email: "user@example.com",
        name: "Test User",
        picture: "https://example.com/avatar.png",
      },
    });

    const camerasResponse = await agent.get("/api/cameras").expect(200);
    expect(Array.isArray(camerasResponse.body)).toBe(true);
    expect(camerasResponse.body.length).toBeGreaterThan(0);

    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/cameras").expect(401);
  });
});
