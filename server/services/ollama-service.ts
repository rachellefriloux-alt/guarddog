/**
 * Ollama Service — free local LLM (no API key, no internet)
 *
 * Talks HTTP to a locally-running Ollama instance (https://ollama.com).
 * Ollama runs models like llama3.2-vision, llava, qwen2.5, mistral, phi3
 * entirely on the user's own hardware — no signup, no key, no quota.
 *
 * Quick install (any OS):
 *   1. Download Ollama from https://ollama.com/download (one-click installer).
 *   2. `ollama pull llava` (vision model) and `ollama pull llama3.2`  (text).
 *   3. Set `AI_PROVIDER=ollama` in .env. Done — no key needed.
 *
 * The service is intentionally a thin wrapper over fetch() so it has zero
 * additional dependencies and no native binaries to ship.
 */

const DEFAULT_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const DEFAULT_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llava";
const DEFAULT_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || "llama3.2";

export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

export class OllamaService {
  private readonly host: string;

  constructor(host: string = DEFAULT_HOST) {
    this.host = host.replace(/\/$/, "");
  }

  /** Quick health check — does an Ollama instance answer at the configured host? */
  async isAvailable(timeoutMs = 1500): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${this.host}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Generate text from a prompt using the configured text model. */
  async generateText(prompt: string, model: string = DEFAULT_TEXT_MODEL): Promise<string> {
    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    if (!res.ok) {
      throw new Error(`Ollama generate failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as OllamaResponse;
    return data.response || "";
  }

  /**
   * Vision: describe an image (base64, no data: prefix) using a multimodal model
   * such as llava or llama3.2-vision.
   */
  async describeImage(
    base64Image: string,
    prompt = "Describe what is happening in this surveillance image. Identify any people, vehicles, or animals.",
    model: string = DEFAULT_VISION_MODEL
  ): Promise<string> {
    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        images: [base64Image],
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama vision failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as OllamaResponse;
    return data.response || "";
  }

  /** Vision + structured JSON: ask the model to return a {detected, type, confidence, description}. */
  async detectObjects(base64Image: string, model: string = DEFAULT_VISION_MODEL): Promise<{
    detected: boolean;
    type: "person" | "pet" | "vehicle" | "unknown";
    confidence: number;
    description: string;
  }> {
    const prompt = `You are analyzing a surveillance camera frame. Respond with ONLY a JSON object of the form
{"detected": boolean, "type": "person"|"pet"|"vehicle"|"unknown", "confidence": 0.0-1.0, "description": "..."}.
"detected" is true if anything notable is visible. Do not include any text outside the JSON.`;

    const raw = await this.describeImage(base64Image, prompt, model);
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("no JSON found in response");
      const parsed = JSON.parse(match[0]);
      return {
        detected: Boolean(parsed.detected),
        type: ["person", "pet", "vehicle", "unknown"].includes(parsed.type) ? parsed.type : "unknown",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        description: typeof parsed.description === "string" ? parsed.description : raw,
      };
    } catch {
      return { detected: false, type: "unknown", confidence: 0, description: raw };
    }
  }
}

export const ollamaService = new OllamaService();
