/**
 * Scrollable timeline of events grouped by day. Supports filtering by
 * camera id and an ISO date range, then opens an EventViewer modal when
 * the user clicks a card. Pulls camera names from `/api/cameras` so the
 * dropdown shows friendly labels alongside ids.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import EventCard, { type TimelineEvent } from './EventCard';
import EventViewer from './EventViewer';
import type { Camera } from '@shared/schema';

interface ListResponse {
  events: TimelineEvent[];
  limit: number;
  offset: number;
  total: number;
}

interface Props {
  /** Optional override; when set the camera filter is hidden. */
  cameraId?: string;
  onOpenLiveView?: (cameraId: string) => void;
  /** Override the deep-link target when no eventId comes from props. */
  initialEventId?: string;
}

const ALL_CAMERAS_VALUE = '__all__';

function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export default function EventTimeline({ cameraId: forcedCameraId, onOpenLiveView, initialEventId }: Props) {
  const [filterCamera, setFilterCamera] = useState<string>(forcedCameraId ?? '');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  const effectiveCamera = forcedCameraId ?? filterCamera;

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (effectiveCamera) params.set('cameraId', effectiveCamera);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) {
      // Treat the `to` filter as end-of-day inclusive so a single date picks
      // up everything that happened that day.
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      params.set('to', end.toISOString());
    }
    const qs = params.toString();
    return qs ? `/api/events?${qs}` : '/api/events';
  }, [effectiveCamera, from, to]);

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ['events-timeline', queryUrl],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // Backwards-compatible: accept either the wrapped DTO response or a
      // bare array (older Express handler).
      if (Array.isArray(body)) {
        return { events: body, limit: body.length, offset: 0, total: body.length };
      }
      return body;
    },
  });

  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ['/api/cameras'],
  });

  const cameraLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cameras) map.set(c.id, c.name);
    return map;
  }, [cameras]);

  const events = useMemo(() => {
    return (data?.events ?? []).map((e) => ({
      ...e,
      cameraName: e.cameraName ?? (e.cameraId ? cameraLabel.get(e.cameraId) : undefined),
    }));
  }, [data, cameraLabel]);

  // Deep-link: open the requested event once it's in the loaded set.
  useEffect(() => {
    if (!initialEventId || selected) return;
    const match = events.find((e) => e.id === initialEventId);
    if (match) setSelected(match);
  }, [initialEventId, events, selected]);

  // Group events under day headers (DESC by timestamp).
  const grouped = useMemo(() => {
    const buckets = new Map<number, TimelineEvent[]>();
    for (const e of events) {
      const day = startOfDay(new Date(e.timestamp));
      const bucket = buckets.get(day);
      if (bucket) bucket.push(e);
      else buckets.set(day, [e]);
    }
    return Array.from(buckets.entries()).sort((a, b) => b[0] - a[0]);
  }, [events]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {!forcedCameraId && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="event-camera-filter">
              Camera
            </label>
            <Select
              value={filterCamera === '' ? ALL_CAMERAS_VALUE : filterCamera}
              onValueChange={(v) => setFilterCamera(v === ALL_CAMERAS_VALUE ? '' : v)}
            >
              <SelectTrigger id="event-camera-filter" className="w-56" data-testid="event-camera-filter">
                <SelectValue placeholder="All cameras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CAMERAS_VALUE}>All cameras</SelectItem>
                {cameras.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="event-from">
            From
          </label>
          <Input
            id="event-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
            data-testid="event-from"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="event-to">
            To
          </label>
          <Input
            id="event-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
            data-testid="event-to"
          />
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading events…</div>}
      {error && (
        <div className="text-sm text-destructive">
          Failed to load events: {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && events.length === 0 && (
        <div className="text-sm text-muted-foreground">No events found for these filters.</div>
      )}

      {grouped.map(([day, dayEvents]) => (
        <section key={day} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDay(new Date(day))}
          </h2>
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <EventCard key={e.id} event={e} onClick={() => setSelected(e)} />
            ))}
          </div>
        </section>
      ))}

      <EventViewer
        event={selected}
        onClose={() => setSelected(null)}
        onOpenLiveView={onOpenLiveView}
      />
    </div>
  );
}
