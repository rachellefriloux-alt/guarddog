/**
 * AI smart filters
 *
 * Lets users describe alert rules in natural language ("Notify me when a
 * person is on the driveway between 10pm and 6am") and converts them into a
 * structured rule the rest of the app can evaluate against detection events.
 *
 * The conversion uses whatever AI provider is active — Ollama (local, free)
 * if available, OpenAI otherwise. When no provider is configured we fall
 * back to a deterministic regex-based parser that handles the most common
 * patterns so the feature still works out of the box.
 */

import { generateText } from "./ai-provider-router";

export type DetectionType = "person" | "pet" | "vehicle" | "package" | "any";

export interface SmartRule {
  /** What kind of detection should match. */
  detection: DetectionType;
  /** Optional camera or location filter (matches camera.name OR camera.location). */
  cameraFilter?: string;
  /** Optional time window in 24-hour HH:MM format. Crosses midnight when start > end. */
  timeWindow?: { start: string; end: string };
  /** Minimum confidence (0-1). */
  minConfidence?: number;
  /** Free-form notification message template. */
  message: string;
}

export interface SmartRuleResult {
  rule: SmartRule;
  /** "ai" if produced by an LLM, "fallback" if produced by the regex parser. */
  source: "ai" | "fallback";
  /** Original user prompt. */
  prompt: string;
}

const SYSTEM_PROMPT = `You are a JSON-only API. Convert the user's natural-language alert rule into JSON.
Schema:
{
  "detection": "person" | "pet" | "vehicle" | "package" | "any",
  "cameraFilter": string | null,
  "timeWindow": { "start": "HH:MM", "end": "HH:MM" } | null,
  "minConfidence": number 0..1 | null,
  "message": string
}
Respond with ONLY the JSON. No prose, no code fences.`;

const DETECTION_KEYWORDS: Record<DetectionType, RegExp> = {
  person: /\b(person|people|someone|stranger|intruder|visitor)\b/i,
  pet: /\b(pet|dog|cat|animal)\b/i,
  vehicle: /\b(car|vehicle|truck|van|motorcycle)\b/i,
  package: /\b(package|delivery|parcel|amazon)\b/i,
  any: /\b(motion|anything|any movement)\b/i,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseTime(text: string): string | null {
  // 24h: 22:00, 6:30
  const m24 = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m24) return `${pad(Number(m24[1]))}:${m24[2]}`;
  // 12h: 10pm, 6 am, 11pm
  const m12 = text.match(/\b(\d{1,2})\s?(am|pm)\b/i);
  if (m12) {
    let h = Number(m12[1]) % 12;
    if (m12[2].toLowerCase() === "pm") h += 12;
    return `${pad(h)}:00`;
  }
  return null;
}

/**
 * Deterministic, dependency-free parser used when no LLM is available. It
 * handles the most common phrasings; anything more exotic falls back to an
 * "any" detection with the full prompt as the message.
 */
export function fallbackParse(prompt: string): SmartRule {
  const lower = prompt.toLowerCase();

  let detection: DetectionType = "any";
  for (const [type, re] of Object.entries(DETECTION_KEYWORDS) as [DetectionType, RegExp][]) {
    if (re.test(lower)) {
      detection = type;
      break;
    }
  }

  // Camera filter: look for "on the X" / "at the X".
  let cameraFilter: string | undefined;
  const cameraMatch = lower.match(/\b(?:on|at|near|in)\s+the\s+([a-z][a-z _-]{1,30}?)(?:\s+between|\s+from|\s+when|[,.]|$)/);
  if (cameraMatch) cameraFilter = cameraMatch[1].trim();

  // Time window: "between X and Y" or "from X to Y" or "after X".
  // Bounded character classes (max 12 chars each) keep this safe from
  // catastrophic-backtracking inputs (CodeQL js/polynomial-redos).
  let timeWindow: SmartRule["timeWindow"] | undefined;
  const between = lower.match(
    /(?:between|from)\s([0-9apm: ]{1,12})\s(?:and|to|-)\s([0-9apm: ]{1,12})(?:[,.]|$)/,
  );
  if (between) {
    const start = parseTime(between[1]);
    const end = parseTime(between[2]);
    if (start && end) timeWindow = { start, end };
  }

  return {
    detection,
    cameraFilter,
    timeWindow,
    minConfidence: 0.6,
    message: prompt.trim(),
  };
}

/** Translate a natural-language alert description into a structured rule. */
export async function parseSmartRule(prompt: string): Promise<SmartRuleResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error("Empty prompt");
  }

  const aiText = await generateText(`${SYSTEM_PROMPT}\n\nUser: ${trimmed}\nJSON:`);
  if (aiText) {
    try {
      // The model sometimes wraps JSON in code fences; strip them.
      const cleaned = aiText
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      const rule: SmartRule = {
        detection: ["person", "pet", "vehicle", "package", "any"].includes(parsed.detection)
          ? parsed.detection
          : "any",
        cameraFilter: parsed.cameraFilter || undefined,
        timeWindow: parsed.timeWindow || undefined,
        minConfidence:
          typeof parsed.minConfidence === "number" ? parsed.minConfidence : 0.6,
        message: typeof parsed.message === "string" && parsed.message ? parsed.message : trimmed,
      };
      return { rule, source: "ai", prompt: trimmed };
    } catch (err) {
      console.warn("[SmartFilter] LLM produced unparseable JSON, falling back:", err);
    }
  }

  return { rule: fallbackParse(trimmed), source: "fallback", prompt: trimmed };
}

/** Evaluate whether an event matches a saved rule. */
export interface DetectionEvent {
  cameraName: string;
  cameraLocation?: string;
  type: DetectionType | string;
  confidence: number;
  /** Optional override for the event time. Used in tests. */
  at?: Date;
}

export function ruleMatches(rule: SmartRule, event: DetectionEvent): boolean {
  if (rule.detection !== "any" && rule.detection !== event.type) return false;
  if (rule.minConfidence != null && event.confidence < rule.minConfidence) return false;

  if (rule.cameraFilter) {
    const haystack = `${event.cameraName} ${event.cameraLocation ?? ""}`.toLowerCase();
    if (!haystack.includes(rule.cameraFilter.toLowerCase())) return false;
  }

  if (rule.timeWindow) {
    const now = event.at ?? new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = rule.timeWindow.start.split(":").map(Number);
    const [eh, em] = rule.timeWindow.end.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (startMin <= endMin) {
      if (minutes < startMin || minutes > endMin) return false;
    } else {
      // Window crosses midnight (e.g. 22:00 → 06:00).
      if (minutes < startMin && minutes > endMin) return false;
    }
  }

  return true;
}
