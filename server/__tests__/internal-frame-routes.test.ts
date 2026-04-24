import express from "express";
import request from "supertest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { registerRoutes } from "../routes";
import { sessionMiddleware } from "../session";
import { resetFrameStore } from "../services/frame-store";
import { setEseeCloudAdapter } from "../adapters/eseecloud/eseecloud.adapter";

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware);
  const server = await registerRoutes(app);
  return { app, server };
};

const ORIGINAL_KEY = process.env.ESEE_CAPTURE_AGENT_KEY;
const TEST_KEY = "test-capture-agent-key-1234567890";

function fakeJpeg(size = 32): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[size - 2] = 0xff;
  buf[size - 1] = 0xd9;
  return buf;
}

describe("Internal device frame routes", () => {
  let app: express.Express;
  let httpServer: import("http").Server;

  beforeEach(async () => {
    process.env.ESEE_CAPTURE_AGENT_KEY = TEST_KEY;
    resetFrameStore();
    setEseeCloudAdapter(null); // force re-construction against the fresh store
    const built = await buildApp();
    app = built.app;
    httpServer = built.server;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    setEseeCloudAdapter(null);
    if (ORIGINAL_KEY === undefined) delete process.env.ESEE_CAPTURE_AGENT_KEY;
    else process.env.ESEE_CAPTURE_AGENT_KEY = ORIGINAL_KEY;
  });

  it("rejects ingest without the capture-agent key (401)", async () => {
    await request(app)
      .post("/api/internal/devices/cam-1/frame")
      .set("Content-Type", "image/jpeg")
      .send(fakeJpeg())
      .expect(401);
  });

  it("rejects path-traversal-style deviceIds at the auth gate (401)", async () => {
    // The auth-bypass regex deliberately mirrors `isValidCameraId`, so a
    // bad deviceId never reaches the route handler — the session-auth gate
    // catches it first. That's the intended defense-in-depth behaviour.
    await request(app)
      .post("/api/internal/devices/..%2Fbad/frame")
      .set("Content-Type", "image/jpeg")
      .set("x-capture-agent-key", TEST_KEY)
      .send(fakeJpeg())
      .expect(401);
  });

  it("returns 503 when the agent key env var is unset", async () => {
    delete process.env.ESEE_CAPTURE_AGENT_KEY;
    await request(app)
      .post("/api/internal/devices/cam-1/frame")
      .set("Content-Type", "image/jpeg")
      .set("x-capture-agent-key", "anything")
      .send(fakeJpeg())
      .expect(503);
  });

  it("ingests a frame, then serves it back to a session-authenticated GET", async () => {
    const agent = request.agent(app);

    // Ingest as the capture agent.
    await agent
      .post("/api/internal/devices/cam-1/frame")
      .set("Content-Type", "image/jpeg")
      .set("x-capture-agent-key", TEST_KEY)
      .send(fakeJpeg(64))
      .expect(204);

    // GET requires a session — confirm the auth gate is in front of it.
    await agent.get("/api/internal/devices/cam-1/frame").expect(401);

    // Log in via dev-login (the repo's local-auth shortcut).
    await agent.post("/api/auth/dev-login").expect(200);

    const res = await agent
      .get("/api/internal/devices/cam-1/frame")
      .expect(200)
      .expect("Content-Type", /image\/jpeg/);

    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-frame-sequence"]).toBe("1");
    expect(Number(res.headers["x-captured-at"])).toBeGreaterThan(0);
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBe(64);
  });

  it("GET returns 404 when no frame has been ingested yet", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/dev-login").expect(200);
    await agent.get("/api/internal/devices/cam-empty/frame").expect(404);
  });

  it("GET rejects an invalid deviceId with 400 once authenticated", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/dev-login").expect(200);
    // Encoded space — passes the auth gate (no path-traversal regex
    // exclusion on GET) but fails the in-route `isValidCameraId` check.
    await agent.get("/api/internal/devices/cam%201/frame").expect(400);
  });
});
