import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectOneDrivePath,
  loadStreamsFromFile,
  resolveStoragePath,
} from "../services/sovereign-recorder";

describe("sovereign-recorder helpers", () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guarddog-rec-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  describe("resolveStoragePath", () => {
    it("uses an explicit override when provided", () => {
      const target = path.join(tmpDir, "explicit");
      const resolved = resolveStoragePath(target);
      expect(resolved).toBe(target);
      expect(fs.existsSync(resolved)).toBe(true);
    });

    it("respects SOVEREIGN_STORAGE_PATH from the environment", () => {
      const target = path.join(tmpDir, "from-env");
      process.env.SOVEREIGN_STORAGE_PATH = target;
      const resolved = resolveStoragePath();
      expect(resolved).toBe(target);
      expect(fs.existsSync(resolved)).toBe(true);
    });

    it("falls back to STORAGE_DIR/recordings when no OneDrive is detected", () => {
      delete process.env.SOVEREIGN_STORAGE_PATH;
      delete process.env.ONEDRIVE;
      delete process.env.USERPROFILE;
      // Point HOME at an empty tmpdir so detectOneDrivePath returns null
      process.env.HOME = path.join(tmpDir, "home-with-no-onedrive");
      fs.mkdirSync(process.env.HOME, { recursive: true });
      process.env.STORAGE_DIR = path.join(tmpDir, "storage");

      const resolved = resolveStoragePath();
      expect(resolved).toBe(path.join(tmpDir, "storage", "recordings"));
      expect(fs.existsSync(resolved)).toBe(true);
    });
  });

  describe("detectOneDrivePath", () => {
    it("returns null when no OneDrive folder exists", () => {
      delete process.env.SOVEREIGN_STORAGE_PATH;
      delete process.env.ONEDRIVE;
      delete process.env.USERPROFILE;
      process.env.HOME = path.join(tmpDir, "empty-home");
      fs.mkdirSync(process.env.HOME, { recursive: true });
      expect(detectOneDrivePath()).toBeNull();
    });

    it("detects ~/OneDrive when present", () => {
      delete process.env.SOVEREIGN_STORAGE_PATH;
      delete process.env.ONEDRIVE;
      delete process.env.USERPROFILE;
      process.env.HOME = path.join(tmpDir, "home-with-onedrive");
      fs.mkdirSync(path.join(process.env.HOME, "OneDrive"), { recursive: true });
      expect(detectOneDrivePath()).toBe(path.join(process.env.HOME, "OneDrive"));
    });
  });

  describe("loadStreamsFromFile", () => {
    it("returns [] when the file does not exist", () => {
      expect(loadStreamsFromFile(path.join(tmpDir, "nope.json"))).toEqual([]);
    });

    it("parses a valid JSON array of {name, url}", () => {
      const file = path.join(tmpDir, "streams.json");
      fs.writeFileSync(
        file,
        JSON.stringify([
          { name: "Front_Door", url: "rtsp://127.0.0.1:8554/front" },
          { name: "Back_Door", url: "rtsp://127.0.0.1:8554/back" },
          { name: "bad-entry-no-url" },
        ])
      );
      const streams = loadStreamsFromFile(file);
      expect(streams).toEqual([
        { name: "Front_Door", url: "rtsp://127.0.0.1:8554/front" },
        { name: "Back_Door", url: "rtsp://127.0.0.1:8554/back" },
      ]);
    });

    it("returns [] on malformed JSON", () => {
      const file = path.join(tmpDir, "broken.json");
      fs.writeFileSync(file, "{not json");
      expect(loadStreamsFromFile(file)).toEqual([]);
    });
  });
});
