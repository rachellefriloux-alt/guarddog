import { describe, it, expect, beforeEach, vi } from "vitest";
import { MqttEventsBridge } from "../services/mqtt-events-bridge";
import { storage } from "../storage";

describe("MqttEventsBridge", () => {
  let bridge: MqttEventsBridge;
  let createDetection: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bridge = new MqttEventsBridge({ url: "mqtt://localhost:1883" });
    createDetection = vi
      .spyOn(storage, "createDetection")
      .mockResolvedValue({ id: "det-1" } as never);
  });

  it("isConfigured returns true when a URL is provided", () => {
    expect(bridge.isConfigured()).toBe(true);
    expect(new MqttEventsBridge({ url: "" }).isConfigured()).toBe(false);
  });

  it("ignores Frigate update/end events and only records 'new'", async () => {
    await bridge.handleMessage(
      Buffer.from(JSON.stringify({ type: "update", after: { camera: "front", label: "person" } }))
    );
    expect(createDetection).not.toHaveBeenCalled();

    await bridge.handleMessage(
      Buffer.from(JSON.stringify({ type: "new", after: { camera: "front", label: "person", top_score: 0.91 } }))
    );
    expect(createDetection).toHaveBeenCalledTimes(1);
    const arg = createDetection.mock.calls[0][0] as { type: string; cameraId: string; confidence: number };
    expect(arg.type).toBe("person");
    expect(arg.cameraId).toBe("front");
    expect(arg.confidence).toBeCloseTo(0.91);
  });

  it("classifies Frigate labels into person / pet / vehicle / unknown", async () => {
    const send = (label: string) =>
      bridge.handleMessage(
        Buffer.from(JSON.stringify({ type: "new", after: { camera: "c", label, top_score: 0.5 } }))
      );

    await send("car");
    await send("dog");
    await send("kangaroo");

    const types = createDetection.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toEqual(["vehicle", "pet", "unknown"]);
  });

  it("accepts generic {camera,label,score} payloads", async () => {
    await bridge.handleMessage(
      Buffer.from(JSON.stringify({ camera: "back", label: "truck", score: 0.7 }))
    );
    expect(createDetection).toHaveBeenCalledTimes(1);
    expect((createDetection.mock.calls[0][0] as { type: string }).type).toBe("vehicle");
  });

  it("silently drops non-JSON traffic", async () => {
    await bridge.handleMessage(Buffer.from("not json at all"));
    expect(createDetection).not.toHaveBeenCalled();
  });

  it("drops messages missing camera or label", async () => {
    await bridge.handleMessage(Buffer.from(JSON.stringify({ camera: "x" })));
    await bridge.handleMessage(Buffer.from(JSON.stringify({ label: "person" })));
    expect(createDetection).not.toHaveBeenCalled();
  });
});
