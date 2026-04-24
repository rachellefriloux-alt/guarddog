import { mediaEventId, toEventDto } from './event.dto';
import { EventEntity } from '../../entities/event.entity';
import { EventsService } from './events.service';

function makeEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  const ev = new EventEntity();
  ev.id = 'evt_1';
  ev.deviceId = 'cam-front';
  ev.deviceKey = 'k';
  ev.type = 'person';
  ev.confidence = 0.87;
  ev.bbox = [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4, label: 'person' }];
  ev.metadata = null;
  ev.timestamp = new Date('2024-05-01T12:00:00.000Z');
  return Object.assign(ev, overrides);
}

describe('toEventDto', () => {
  it('exposes thumbnail/clip endpoint URLs only when media exists', () => {
    const ev = makeEvent();
    const none = toEventDto(ev, { hasSnapshot: false, hasClip: false });
    expect(none.thumbnailUrl).toBeNull();
    expect(none.clipUrl).toBeNull();

    const both = toEventDto(ev, { hasSnapshot: true, hasClip: true });
    expect(both.thumbnailUrl).toBe('/api/events/evt_1/thumbnail');
    expect(both.clipUrl).toBe('/api/events/evt_1/clip');
  });

  it('prefers explicit metadata urls over the generated endpoints', () => {
    const ev = makeEvent({
      metadata: { thumbnailUrl: 'https://cdn/x.jpg', clipUrl: 'https://cdn/x.mp4' },
    });
    const dto = toEventDto(ev, { hasSnapshot: true, hasClip: true });
    expect(dto.thumbnailUrl).toBe('https://cdn/x.jpg');
    expect(dto.clipUrl).toBe('https://cdn/x.mp4');
  });

  it('normalizes bounding boxes from array, envelope, and width/height aliases', () => {
    const arr = toEventDto(makeEvent({ bbox: [{ x: 0, y: 0, w: 1, h: 1 }] }), {
      hasSnapshot: false,
      hasClip: false,
    });
    expect(arr.ai.boxes).toHaveLength(1);

    const env = toEventDto(
      makeEvent({ bbox: { boxes: [{ x: 0, y: 0, width: 1, height: 1, label: 'car' }] } }),
      { hasSnapshot: false, hasClip: false },
    );
    expect(env.ai.boxes).toEqual([{ x: 0, y: 0, w: 1, h: 1, label: 'car' }]);

    const drop = toEventDto(makeEvent({ bbox: [{ x: 'bad', y: 0, w: 1, h: 1 }] }), {
      hasSnapshot: false,
      hasClip: false,
    });
    expect(drop.ai.boxes).toEqual([]);
  });

  it('emits ISO timestamps and surfaces confidence as ai.score', () => {
    const dto = toEventDto(makeEvent(), { hasSnapshot: false, hasClip: false });
    expect(dto.timestamp).toBe('2024-05-01T12:00:00.000Z');
    expect(dto.ai.score).toBe(0.87);
    expect(dto.cameraId).toBe('cam-front');
  });
});

describe('mediaEventId', () => {
  it('returns the embedded eventId from media metadata, or null', () => {
    expect(mediaEventId({ metadata: { eventId: 'evt_42' } } as any)).toBe('evt_42');
    expect(mediaEventId({ metadata: null } as any)).toBeNull();
    expect(mediaEventId({ metadata: { eventId: 7 } } as any)).toBeNull();
  });
});

describe('EventsService.normalizePaging', () => {
  it('clamps to defaults and bounds', () => {
    expect(EventsService.normalizePaging(undefined, undefined)).toEqual({ limit: 50, offset: 0 });
    expect(EventsService.normalizePaging('1000', '-5')).toEqual({ limit: 200, offset: 0 });
    expect(EventsService.normalizePaging('0', '10')).toEqual({ limit: 50, offset: 10 });
    expect(EventsService.normalizePaging('25', '7')).toEqual({ limit: 25, offset: 7 });
  });
});

describe('EventsService.parseDate', () => {
  it('parses ISO timestamps and rejects junk', () => {
    expect(EventsService.parseDate('2024-05-01T00:00:00Z')?.toISOString()).toBe(
      '2024-05-01T00:00:00.000Z',
    );
    expect(EventsService.parseDate('not-a-date')).toBeUndefined();
    expect(EventsService.parseDate(undefined)).toBeUndefined();
  });
});

describe('EventsService.resolveMediaPath', () => {
  it('rejects empty paths and traversal outside the media root', async () => {
    await expect(EventsService.resolveMediaPath('')).rejects.toThrow();
    // /etc/passwd is outside cwd, so this must not resolve even though it exists.
    await expect(EventsService.resolveMediaPath('/etc/passwd')).rejects.toThrow();
  });
});
