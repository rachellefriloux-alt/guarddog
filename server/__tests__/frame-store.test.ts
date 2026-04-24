import { describe, expect, it } from "vitest";

import {
  FrameStore,
  isValidCameraId,
  resetFrameStore,
} from "../services/frame-store";

function jpeg(size = 16): Buffer {
  // SOI/EOI markers around random body — content doesn't matter for the
  // store, but using something that *looks* like a JPEG keeps debugging sane.
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[size - 2] = 0xff;
  buf[size - 1] = 0xd9;
  return buf;
}

describe("FrameStore", () => {
  it("returns undefined when no frame has been pushed", () => {
    const store = new FrameStore();
    expect(store.get("cam-1")).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it("stores and returns the most recent frame with monotonic sequences", () => {
    let now = 1_000_000;
    const store = new FrameStore({ now: () => now });

    const r1 = store.put("cam-1", jpeg(32));
    expect(r1).toEqual({ ok: true, sequence: 1 });
    now += 10;
    const r2 = store.put("cam-1", jpeg(64));
    expect(r2).toEqual({ ok: true, sequence: 2 });

    const f = store.get("cam-1");
    expect(f).toBeDefined();
    expect(f!.sequence).toBe(2);
    expect(f!.jpeg.length).toBe(64);
    expect(f!.capturedAt).toBe(1_000_010);
  });

  it("rejects empty payloads", () => {
    const store = new FrameStore();
    expect(store.put("cam-1", Buffer.alloc(0))).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects payloads larger than maxFrameBytes", () => {
    const store = new FrameStore({ maxFrameBytes: 100 });
    const result = store.put("cam-1", jpeg(200));
    expect(result).toEqual({ ok: false, reason: "too-large", bytes: 200, limit: 100 });
    expect(store.get("cam-1")).toBeUndefined();
  });

  it("treats frames older than staleAfterMs as missing and evicts them", () => {
    let now = 0;
    const store = new FrameStore({ staleAfterMs: 1000, now: () => now });
    store.put("cam-1", jpeg());
    expect(store.get("cam-1")).toBeDefined();

    now = 1500;
    expect(store.get("cam-1")).toBeUndefined();
    // List() must agree with get() — no ghost cameras.
    expect(store.list()).toEqual([]);
  });

  it("evicts the oldest-touched camera when over capacity", () => {
    const store = new FrameStore({ maxCameras: 2 });
    store.put("a", jpeg());
    store.put("b", jpeg());
    store.put("c", jpeg());

    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toBeDefined();
    expect(store.get("c")).toBeDefined();
  });

  it("re-touching a camera bumps it to most-recent for eviction order", () => {
    const store = new FrameStore({ maxCameras: 2 });
    store.put("a", jpeg());
    store.put("b", jpeg());
    // Re-touch "a" → "b" becomes the oldest.
    store.put("a", jpeg());
    store.put("c", jpeg());

    expect(store.get("a")).toBeDefined();
    expect(store.get("b")).toBeUndefined();
    expect(store.get("c")).toBeDefined();
  });

  it("list() reports only fresh cameras with their age in ms", () => {
    let now = 0;
    const store = new FrameStore({ staleAfterMs: 1000, now: () => now });
    store.put("a", jpeg(10));
    now = 200;
    store.put("b", jpeg(20));
    now = 500;

    const list = store.list();
    expect(list).toHaveLength(2);
    const a = list.find((d) => d.cameraId === "a")!;
    const b = list.find((d) => d.cameraId === "b")!;
    expect(a.ageMs).toBe(500);
    expect(a.bytes).toBe(10);
    expect(b.ageMs).toBe(300);
    expect(b.bytes).toBe(20);
  });

  it("delete() removes the camera and clear() empties everything", () => {
    const store = new FrameStore();
    store.put("a", jpeg());
    store.put("b", jpeg());
    expect(store.delete("a")).toBe(true);
    expect(store.delete("a")).toBe(false);
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toBeDefined();
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("resetFrameStore() returns a fresh singleton each call", () => {
    const a = resetFrameStore();
    a.put("x", jpeg());
    const b = resetFrameStore();
    expect(b).not.toBe(a);
    expect(b.get("x")).toBeUndefined();
  });
});

describe("isValidCameraId", () => {
  it("accepts conventional ids", () => {
    expect(isValidCameraId("cam-1")).toBe(true);
    expect(isValidCameraId("front_door")).toBe(true);
    expect(isValidCameraId("Camera.4")).toBe(true);
    expect(isValidCameraId("a".repeat(64))).toBe(true);
  });

  it("rejects empty / oversized / control / path-like ids", () => {
    expect(isValidCameraId("")).toBe(false);
    expect(isValidCameraId("a".repeat(65))).toBe(false);
    expect(isValidCameraId("../etc/passwd")).toBe(false);
    expect(isValidCameraId("cam 1")).toBe(false);
    expect(isValidCameraId("cam/1")).toBe(false);
    expect(isValidCameraId("cam\n1")).toBe(false);
    expect(isValidCameraId(null as unknown as string)).toBe(false);
  });
});
