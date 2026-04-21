/**
 * Local OCR Service — license plates, signs, time/date stamps in frames.
 *
 * Uses Tesseract.js (Apache 2.0). Pure JavaScript — no native deps, no API
 * key, no network calls after the model file is downloaded once on first use.
 *
 * The Tesseract worker is created lazily so app startup stays fast and users
 * who never use OCR never pay the model-download cost.
 */

import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Dynamic import keeps tesseract out of the cold-start path of the main server.
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      return worker;
    })();
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
  /** Cleaned, uppercase, alphanumeric-only candidate license plate, or null. */
  plate: string | null;
}

const PLATE_REGEX = /\b[A-Z0-9]{2,3}[\s-]?[A-Z0-9]{2,5}\b/;

export class LocalOcrService {
  /** Read all visible text in an image. */
  async readImage(image: Buffer | string): Promise<OcrResult> {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    const cleaned = data.text.trim();
    return {
      text: cleaned,
      confidence: data.confidence / 100, // tesseract returns 0–100, normalize to 0–1
      plate: this.extractPlate(cleaned),
    };
  }

  /** Heuristic license-plate extraction from raw OCR text. */
  extractPlate(text: string): string | null {
    const upper = text.toUpperCase().replace(/[^A-Z0-9\s-]/g, " ");
    const match = upper.match(PLATE_REGEX);
    if (!match) return null;
    return match[0].replace(/[\s-]/g, "");
  }

  /** Release the Tesseract worker. Safe to call on shutdown. */
  async terminate(): Promise<void> {
    if (workerPromise) {
      const worker = await workerPromise;
      await worker.terminate();
      workerPromise = null;
    }
  }
}

export const localOcrService = new LocalOcrService();
