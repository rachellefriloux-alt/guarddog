import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  analyzeMotion,
  getActiveProvider,
  resetProviderCache,
} from "../services/ai-provider-router";
import { ollamaService } from "../services/ollama-service";
import { openaiService } from "../services/openai-service";

describe("ai-provider-router", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetProviderCache();
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetProviderCache();
    vi.restoreAllMocks();
  });

  it("honors AI_PROVIDER=disabled", async () => {
    process.env.AI_PROVIDER = "disabled";
    expect(await getActiveProvider()).toBe("disabled");
    const res = await analyzeMotion("xxx");
    expect(res.detected).toBe(false);
    expect(res.metadata?.provider).toBe("disabled");
  });

  it("honors AI_PROVIDER=ollama and routes through ollamaService", async () => {
    process.env.AI_PROVIDER = "ollama";
    const spy = vi.spyOn(ollamaService, "detectObjects").mockResolvedValue({
      detected: true,
      type: "person",
      confidence: 0.8,
      description: "a person",
    });
    const res = await analyzeMotion("base64data");
    expect(spy).toHaveBeenCalledWith("base64data");
    expect(res.type).toBe("person");
    expect(res.metadata?.provider).toBe("ollama");
  });

  it("falls back to disabled when ollama call throws", async () => {
    process.env.AI_PROVIDER = "ollama";
    vi.spyOn(ollamaService, "detectObjects").mockRejectedValue(new Error("connection refused"));
    const res = await analyzeMotion("xxx");
    expect(res.detected).toBe(false);
    expect(res.metadata?.provider).toBe("disabled");
  });

  it("auto-selects ollama when reachable", async () => {
    process.env.AI_PROVIDER = "auto";
    vi.spyOn(ollamaService, "isAvailable").mockResolvedValue(true);
    expect(await getActiveProvider()).toBe("ollama");
  });

  it("auto-selects openai when ollama unreachable but key set", async () => {
    process.env.AI_PROVIDER = "auto";
    process.env.OPENAI_API_KEY = "sk-real-key";
    vi.spyOn(ollamaService, "isAvailable").mockResolvedValue(false);
    expect(await getActiveProvider()).toBe("openai");
  });

  it("auto-selects disabled when nothing is configured", async () => {
    process.env.AI_PROVIDER = "auto";
    vi.spyOn(ollamaService, "isAvailable").mockResolvedValue(false);
    expect(await getActiveProvider()).toBe("disabled");
  });

  it("treats placeholder OPENAI_API_KEY as not configured", async () => {
    process.env.AI_PROVIDER = "auto";
    process.env.OPENAI_API_KEY = "your-openai-api-key-here";
    vi.spyOn(ollamaService, "isAvailable").mockResolvedValue(false);
    expect(await getActiveProvider()).toBe("disabled");
  });

  it("routes through openaiService when provider is openai", async () => {
    process.env.AI_PROVIDER = "openai";
    const spy = vi.spyOn(openaiService, "analyzeImageForMotion").mockResolvedValue({
      detected: true,
      type: "vehicle",
      confidence: 0.6,
      description: "a car",
      metadata: {},
    });
    const res = await analyzeMotion("xxx");
    expect(spy).toHaveBeenCalled();
    expect(res.type).toBe("vehicle");
    expect(res.metadata?.provider).toBe("openai");
  });
});
