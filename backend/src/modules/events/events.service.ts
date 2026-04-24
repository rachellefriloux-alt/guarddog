import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { isAbsolute, resolve as pathResolve, sep as pathSep } from 'path';
import { EventEntity } from '../../entities/event.entity';
import { Snapshot } from '../../entities/snapshot.entity';
import { Clip } from '../../entities/clip.entity';
import { AlertsGateway } from '../../ws/alerts.gateway';
import { PushService } from '../push/push.service';
import {
  EventDto,
  EventListResponse,
  mediaEventId,
  toEventDto,
} from './event.dto';

export interface EventListOptions {
  cameraId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly repo: Repository<EventEntity>,
    @InjectRepository(Snapshot)
    private readonly snapshotsRepo: Repository<Snapshot>,
    @InjectRepository(Clip)
    private readonly clipsRepo: Repository<Clip>,
    private readonly alerts: AlertsGateway,
    private readonly push: PushService,
  ) {}

  /** Parse + clamp `limit`/`offset` from raw query params. */
  static normalizePaging(rawLimit?: string, rawOffset?: string): { limit: number; offset: number } {
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(rawLimit) || DEFAULT_LIMIT));
    const offset = Math.max(0, Number(rawOffset) || 0);
    return { limit, offset };
  }

  /** Parse an ISO-8601 timestamp string; returns undefined for invalid input. */
  static parseDate(input?: string): Date | undefined {
    if (!input) return undefined;
    const ts = Date.parse(input);
    if (Number.isNaN(ts)) return undefined;
    return new Date(ts);
  }

  async listForApi(opts: EventListOptions): Promise<EventListResponse> {
    const where: Record<string, unknown> = {};
    if (opts.cameraId) where.deviceId = opts.cameraId;
    if (opts.from && opts.to) where.timestamp = Between(opts.from, opts.to);
    else if (opts.from) where.timestamp = MoreThanOrEqual(opts.from);
    else if (opts.to) where.timestamp = LessThanOrEqual(opts.to);

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      take: opts.limit,
      skip: opts.offset,
    });

    const media = await this.lookupMedia(rows.map((r) => r.id));
    const events: EventDto[] = rows.map((row) =>
      toEventDto(row, {
        hasSnapshot: media.snapshotIds.has(row.id),
        hasClip: media.clipIds.has(row.id),
      }),
    );

    return { events, limit: opts.limit, offset: opts.offset, total };
  }

  /**
   * Batch-lookup snapshots + clips that were tagged with one of the given
   * event ids in their `metadata.eventId`. `metadata` is persisted as
   * `simple-json` (TEXT), so we narrow with a LIKE on the serialized JSON
   * (no JSON1 dependency) and then verify in JS.
   */
  private async lookupMedia(eventIds: string[]): Promise<{
    snapshotIds: Set<string>;
    clipIds: Set<string>;
  }> {
    const result = { snapshotIds: new Set<string>(), clipIds: new Set<string>() };
    if (eventIds.length === 0) return result;

    const likes = eventIds.map((id) => `%"eventId":"${escapeLike(id)}"%`);
    const [snaps, clips] = await Promise.all([
      this.findMediaByMetadata(this.snapshotsRepo, likes),
      this.findMediaByMetadata(this.clipsRepo, likes),
    ]);
    const wanted = new Set(eventIds);
    for (const s of snaps) {
      const id = mediaEventId(s);
      if (id && wanted.has(id)) result.snapshotIds.add(id);
    }
    for (const c of clips) {
      const id = mediaEventId(c);
      if (id && wanted.has(id)) result.clipIds.add(id);
    }
    return result;
  }

  private async findMediaByMetadata<T extends { metadata: unknown }>(
    repo: Repository<T>,
    likes: string[],
  ): Promise<T[]> {
    if (likes.length === 0) return [];
    const qb = repo.createQueryBuilder('m');
    likes.forEach((like, i) => {
      const param = `like${i}`;
      const clause = `m.metadata LIKE :${param} ESCAPE '\\\\'`;
      if (i === 0) qb.where(clause, { [param]: like });
      else qb.orWhere(clause, { [param]: like });
    });
    return qb.getMany();
  }

  /** Find the snapshot tagged with the given event id, if any. */
  async findSnapshotForEvent(eventId: string): Promise<Snapshot | null> {
    const rows = await this.findMediaByMetadata(this.snapshotsRepo, [
      `%"eventId":"${escapeLike(eventId)}"%`,
    ]);
    return rows.find((r) => mediaEventId(r) === eventId) ?? null;
  }

  /** Find the clip tagged with the given event id, if any. */
  async findClipForEvent(eventId: string): Promise<Clip | null> {
    const rows = await this.findMediaByMetadata(this.clipsRepo, [
      `%"eventId":"${escapeLike(eventId)}"%`,
    ]);
    return rows.find((r) => mediaEventId(r) === eventId) ?? null;
  }

  /**
   * Resolve a stored media path to an absolute filesystem path that is
   * provably inside the configured media root (defaults to process.cwd()).
   * Rejects traversal attempts and symlinks pointing outside the root.
   */
  static async resolveMediaPath(storedPath: string): Promise<string> {
    if (typeof storedPath !== 'string' || storedPath.length === 0) {
      throw new NotFoundException('Media file missing');
    }
    const root = pathResolve(process.env.GUARDDOG_MEDIA_ROOT || process.cwd());
    const candidate = isAbsolute(storedPath) ? storedPath : pathResolve(root, storedPath);
    const real = await fs.realpath(candidate).catch(() => null);
    if (!real) throw new NotFoundException('Media file missing');
    if (real !== root && !real.startsWith(root + pathSep)) {
      throw new NotFoundException('Media file missing');
    }
    return real;
  }

  findAll(): Promise<EventEntity[]> {
    return this.repo.find({ order: { timestamp: 'DESC' }, take: 200 });
  }

  findOne(id: string): Promise<EventEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findOneDto(id: string): Promise<EventDto | null> {
    const row = await this.findOne(id);
    if (!row) return null;
    const media = await this.lookupMedia([row.id]);
    return toEventDto(row, {
      hasSnapshot: media.snapshotIds.has(row.id),
      hasClip: media.clipIds.has(row.id),
    });
  }

  async create(data: Partial<EventEntity>): Promise<EventEntity> {
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    this.alerts.broadcast(saved);
    // Fire-and-forget push fan-out. Push delivery must not block event
    // persistence or the websocket broadcast.
    this.push
      .notify({
        eventId: saved.id,
        cameraId: saved.deviceId,
        type: saved.type,
        timestamp: saved.timestamp.toISOString(),
        thumbnailUrl: saved.metadata?.thumbnailUrl,
      })
      .catch((err: Error) =>
        this.logger.warn(`push notify failed for event ${saved.id}: ${err.message}`),
      );
    return saved;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.repo.delete({ id });
    return { deleted: (res.affected ?? 0) > 0 };
  }
}

/** Escape SQL LIKE wildcards so user-supplied event ids cannot widen matches. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
