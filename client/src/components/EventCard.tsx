/**
 * Compact card for a single timeline entry. Shows the snapshot (or a
 * placeholder), event type, camera, and a relative timestamp. Click anywhere
 * on the card to open the EventViewer.
 */
import { Camera as CameraIcon, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  id: string;
  cameraId: string | null;
  cameraName?: string;
  type: string;
  timestamp: string;
  thumbnailUrl: string | null;
  clipUrl: string | null;
  ai: { boxes: TimelineBox[]; score: number | null };
  metadata?: Record<string, unknown> | null;
}

export interface TimelineBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  score?: number;
}

interface Props {
  event: TimelineEvent;
  onClick: () => void;
}

export default function EventCard({ event, onClick }: Props) {
  const when = new Date(event.timestamp);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`event-card-${event.id}`}
      className={cn(
        'group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-3 text-left transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded bg-muted">
        {event.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumbnailUrl}
            alt={event.type}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <CameraIcon size={20} />
          </div>
        )}
        {event.clipUrl && (
          <div className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-black/60 p-1 text-white">
            <Play size={12} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{event.type}</div>
        <div className="truncate text-sm text-muted-foreground">
          {(event.cameraName || event.cameraId || 'unknown camera') + ' • ' + when.toLocaleString()}
        </div>
        {event.ai.score != null && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Confidence: {Math.round(event.ai.score * 100)}%
          </div>
        )}
      </div>
    </button>
  );
}
