/**
 * AI Provider Router
 *
 * Picks an inference backend at runtime so the rest of the codebase doesn't
 * have to know whether a key is set or whether Ollama is running.
 *
 * Order of preference:
 *   1. AI_PROVIDER env override ("ollama" | "openai" | "disabled")
 *   2. Ollama (free, local, no key) — if reachable on OLLAMA_HOST
 *   3. OpenAI (paid, cloud) — if OPENAI_API_KEY is set
 *   4. Disabled — every call returns a clean "AI disabled" stub
 *
 * This keeps the app fully functional with **zero secrets and zero payment**:
 * the user installs Ollama (one-click), pulls a vision model, and gets local
 * AI for free.
 */

import { ollamaService } from "./ollama-service";
import { openaiService } from "./openai-service";

export type AiProvider = "ollama" | "openai" | "disabled";

export interface MotionAnalysis {
  detected: boolean;
  type: "person" | "pet" | "vehicle" | "unknown";
  confidence: number;
  description: string;
  metadata?: Record<string, unknown>;
}

let resolvedProvider: AiProvider | null = null;

/** Pick the best available provider once and cache the result. */
export async function getActiveProvider(): Promise<AiProvider> {
  if (resolvedProvider) return resolvedProvider;

  const explicit = (process.env.AI_PROVIDER || "auto").toLowerCase();
  if (explicit === "ollama" || explicit === "openai" || explicit === "disabled") {
    resolvedProvider = explicit;
    console.log(`[AIProviderRouter] Using AI provider: ${resolvedProvider} (set via AI_PROVIDER)`);
    return resolvedProvider;
  }

  // Auto: prefer Ollama (free, local), fall back to OpenAI, then disabled.
  if (await ollamaService.isAvailable()) {
    resolvedProvider = "ollama";
  } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your-openai-api-key-here") {
    resolvedProvider = "openai";
  } else {
    resolvedProvider = "disabled";
  }

  console.log(`[AIProviderRouter] Selected AI provider: ${resolvedProvider} (auto-detected)`);
  return resolvedProvider;
}

/** Reset cached selection — used by tests. */
export function resetProviderCache(): void {
  resolvedProvider = null;
}

/** Analyze a base64 image and return a normalized motion analysis. */
export async function analyzeMotion(base64Image: string): Promise<MotionAnalysis> {
  const provider = await getActiveProvider();

  if (provider === "ollama") {
    try {
      const result = await ollamaService.detectObjects(base64Image);
      return { ...result, metadata: { provider: "ollama" } };
    } catch (err) {
      console.warn("[AIProviderRouter] Ollama call failed, falling back to disabled:", err);
      return disabledResponse("Ollama call failed");
    }
  }

  if (provider === "openai") {
    const result = await openaiService.analyzeImageForMotion(base64Image);
    return {
      detected: result.detected,
      type: result.type as MotionAnalysis["type"],
      confidence: result.confidence,
      description: result.description,
      metadata: { ...(result.metadata || {}), provider: "openai" },
    };
  }

  return disabledResponse("No AI provider configured");
}

function disabledResponse(reason: string): MotionAnalysis {
  return {
    detected: false,
    type: "unknown",
    confidence: 0,
    description: `AI disabled: ${reason}. See AI_FEATURES.md for free local options.`,
    metadata: { provider: "disabled" },
  };
}
