import { describe, it, expect, beforeEach } from "vitest";
import {
  bandwidthAdvice,
  cleanupFfprobeError,
  injectCredentials,
  redactUrl,
} from "../services/url-tester";

describe("url-tester helpers", () => {
  describe("injectCredentials", () => {
    it("returns the URL unchanged when no username is provided", () => {
      expect(injectCredentials("rtsp://1.2.3.4/stream")).toBe("rtsp://1.2.3.4/stream");
    });

    it("injects username and password into a credential-less URL", () => {
      expect(injectCredentials("rtsp://1.2.3.4/stream", "admin", "p@ss")).toBe(
        "rtsp://admin:p%40ss@1.2.3.4/stream",
      );
    });

    it("does not overwrite credentials already present in the URL", () => {
      const original = "rtsp://existing:user@1.2.3.4/stream";
      expect(injectCredentials(original, "admin", "p@ss")).toBe(original);
    });

    it("returns the URL untouched when it cannot be parsed", () => {
      expect(injectCredentials("not a url", "u", "p")).toBe("not a url");
    });
  });

  describe("bandwidthAdvice", () => {
    it("returns undefined for missing or zero bitrate", () => {
      expect(bandwidthAdvice(undefined)).toBeUndefined();
      expect(bandwidthAdvice(0)).toBeUndefined();
    });

    it("flags very high bitrate as a problem for cloud sync", () => {
      const advice = bandwidthAdvice(8000);
      expect(advice).toMatch(/saturate/i);
    });

    it("uses cautious wording for moderate bitrate", () => {
      expect(bandwidthAdvice(4000)).toMatch(/should be fine/i);
    });

    it("uses positive wording for low bitrate", () => {
      expect(bandwidthAdvice(800)).toMatch(/comfortable/i);
    });
  });

  describe("cleanupFfprobeError", () => {
    it("strips ffmpeg banner lines", () => {
      const noisy = [
        "ffprobe version 6.0",
        "built with gcc",
        "configuration: --enable-foo",
        "libavutil 58.x",
        "Connection refused",
      ].join("\n");
      const cleaned = cleanupFfprobeError(noisy);
      expect(cleaned).toContain("Connection refused");
      expect(cleaned).not.toContain("ffprobe version");
    });
  });

  describe("redactUrl", () => {
    it("strips embedded credentials from rtsp URLs", () => {
      expect(redactUrl("rtsp://user:secret@10.0.0.1:554/stream")).toBe(
        "rtsp://10.0.0.1:554/stream",
      );
    });

    it("strips embedded credentials from http URLs", () => {
      expect(redactUrl("http://admin:p%40ss@cam.lan/snapshot.jpg?chn=0")).toBe(
        "http://cam.lan/snapshot.jpg?chn=0",
      );
    });

    it("returns credential-less URLs unchanged", () => {
      expect(redactUrl("rtsp://10.0.0.1/stream")).toBe("rtsp://10.0.0.1/stream");
    });

    it("falls back to a regex mask when the URL cannot be parsed", () => {
      expect(redactUrl("rtsp://user:pass@bad host/stream")).toBe("rtsp://***@bad host/stream");
    });

    it("returns empty string for non-string input", () => {
      expect(redactUrl(undefined as unknown as string)).toBe("");
      expect(redactUrl("")).toBe("");
    });
  });
});

describe("camera-presets", () => {
  beforeEach(() => {
    // pristine env per test if needed
  });

  it("exposes a generic-onvif preset and a known vendor", async () => {
    const { cameraPresets, applyPreset } = await import("../services/camera-presets");
    const ids = cameraPresets.map((p) => p.id);
    expect(ids).toContain("generic-onvif");
    expect(ids).toContain("hikvision");
    const preset = cameraPresets.find((p) => p.id === "hikvision")!;
    const url = applyPreset(preset.urlTemplate, {
      ip: "192.168.1.10",
      port: 554,
      user: "admin",
      pass: "secret",
      channel: 2,
    });
    expect(url).toBe("rtsp://admin:secret@192.168.1.10:554/Streaming/Channels/201");
  });

  it("URL-encodes credentials with special characters", async () => {
    const { cameraPresets, applyPreset } = await import("../services/camera-presets");
    const preset = cameraPresets.find((p) => p.id === "generic-onvif")!;
    const url = applyPreset(preset.urlTemplate, {
      ip: "1.1.1.1",
      port: 554,
      user: "user",
      pass: "p@ss/word",
      channel: 1,
    });
    expect(url).toContain("p%40ss%2Fword");
  });
});
