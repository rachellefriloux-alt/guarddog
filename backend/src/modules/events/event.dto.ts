import { EventEntity } from '../../entities/event.entity';
import { Clip } from '../../entities/clip.entity';
import { Snapshot } from '../../entities/snapshot.entity';

/**
 * Normalized bounding box used by the timeline UI overlay.
 * Coordinates are 0..1 fractions of the source frame so the same payload
 * works regardless of the rendered size (web / mobile / desktop).
 */
export interface AiBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  score?: number;
}

export interface EventAiMetadata {
  boxes: AiBox[];
  score: number | null;
}

/**
 * Public shape returned by `GET /api/events` and `GET /api/events/:id`.
 * This is intentionally additive over the raw `EventEntity` so the web,
 * desktop, and mobile timelines can rely on a stable contract regardless
 * of which adapter (Eseecloud, Ring, AI service, etc.) produced the event.
 */
export interface EventDto {
  id: string;
  cameraId: string | null;
  type: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  thumbnailUrl: string | null;
  clipUrl: string | null;
  ai: EventAiMetadata;
}

export interface EventListResponse {
  events: EventDto[];
  limit: number;
  offset: number;
  total: number;
}

/**
 * Coerce whatever shape `event.bbox` was persisted as into a list of normalized
 * boxes. Adapters historically wrote either a raw array, a `{ boxes: [...] }`
 * envelope, or a single box object, so we accept all three.
 */
function normalizeBoxes(bbox: unknown): AiBox[] {
  if (!bbox) return [];
  const candidate = Array.isArray(bbox)
    ? bbox
    : typeof bbox === 'object' && bbox !== null && Array.isArray((bbox as { boxes?: unknown }).boxes)
      ? ((bbox as { boxes: unknown[] }).boxes as unknown[])
      : [bbox];
  const out: AiBox[] = [];
  for (const raw of candidate) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const x = Number(r.x);
    const y = Number(r.y);
    const w = Number(r.w ?? r.width);
    const h = Number(r.h ?? r.height);
    if ([x, y, w, h].some((n) => !Number.isFinite(n))) continue;
    const box: AiBox = { x, y, w, h };
    if (typeof r.label === 'string') box.label = r.label;
    const score = Number(r.score ?? r.confidence);
    if (Number.isFinite(score)) box.score = score;
    out.push(box);
  }
  return out;
}

/**
 * Build the DTO for a single event. `hasSnapshot` / `hasClip` flags are
 * computed by the service from a batched lookup so the URLs only point at
 * endpoints that will actually return a 200.
 */
export function toEventDto(
  event: EventEntity,
  opts: { hasSnapshot: boolean; hasClip: boolean },
): EventDto {
  const meta =
    event.metadata && typeof event.metadata === 'object'
      ? (event.metadata as Record<string, unknown>)
      : null;
  const explicitThumb =
    meta && typeof meta.thumbnailUrl === 'string' ? (meta.thumbnailUrl as string) : null;
  const explicitClip =
    meta && typeof meta.clipUrl === 'string' ? (meta.clipUrl as string) : null;
  return {
    id: event.id,
    cameraId: event.deviceId ?? null,
    type: event.type,
    timestamp:
      event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : new Date(event.timestamp as unknown as string).toISOString(),
    metadata: meta,
    thumbnailUrl: explicitThumb ?? (opts.hasSnapshot ? `/api/events/${event.id}/thumbnail` : null),
    clipUrl: explicitClip ?? (opts.hasClip ? `/api/events/${event.id}/clip` : null),
    ai: {
      boxes: normalizeBoxes(event.bbox),
      score: typeof event.confidence === 'number' && Number.isFinite(event.confidence)
        ? event.confidence
        : null,
    },
  };
}

/** Pull the event id (if any) that a snapshot/clip was tagged with. */
export function mediaEventId(media: Pick<Snapshot | Clip, 'metadata'>): string | null {
  if (!media.metadata || typeof media.metadata !== 'object') return null;
  const v = (media.metadata as Record<string, unknown>).eventId;
  return typeof v === 'string' ? v : null;
}
