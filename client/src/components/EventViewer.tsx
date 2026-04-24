/**
 * Modal viewer for a single event. Renders the clip when one is available
 * (otherwise falls back to the snapshot) and overlays AI bounding boxes
 * on top — coordinates are 0..1 fractions of the source frame, so the
 * overlay scales with the video / image element.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TimelineEvent } from './EventCard';

interface Props {
  event: TimelineEvent | null;
  onClose: () => void;
  onOpenLiveView?: (cameraId: string) => void;
}

export default function EventViewer({ event, onClose, onOpenLiveView }: Props) {
  // Allow Escape to close, matching the rest of the app's modal patterns.
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  if (!event) return null;

  const boxes = event.ai?.boxes ?? [];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      data-testid="event-viewer"
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {event.cameraName || event.cameraId || 'Unknown camera'}
            </span>
            {' • '}
            {new Date(event.timestamp).toLocaleString()}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="event-viewer-close"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="relative bg-black">
          {event.clipUrl ? (
            <video
              src={event.clipUrl}
              poster={event.thumbnailUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="block max-h-[60vh] w-full object-contain"
              data-testid="event-viewer-video"
            />
          ) : event.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.thumbnailUrl}
              alt={event.type}
              className="block max-h-[60vh] w-full object-contain"
              data-testid="event-viewer-image"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-white/60">
              No media available for this event.
            </div>
          )}

          {boxes.length > 0 && (
            <div className="pointer-events-none absolute inset-0">
              {boxes.map((b, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-red-500"
                  style={{
                    left: `${Math.max(0, Math.min(1, b.x)) * 100}%`,
                    top: `${Math.max(0, Math.min(1, b.y)) * 100}%`,
                    width: `${Math.max(0, Math.min(1, b.w)) * 100}%`,
                    height: `${Math.max(0, Math.min(1, b.h)) * 100}%`,
                  }}
                >
                  {b.label && (
                    <span className="absolute -top-5 left-0 rounded bg-red-500 px-1 text-xs font-medium text-white">
                      {b.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">Type:</span>{' '}
            <span className="font-medium">{event.type}</span>
          </div>
          {event.ai?.score != null && (
            <div>
              <span className="text-muted-foreground">Confidence:</span>{' '}
              <span className="font-medium">{Math.round(event.ai.score * 100)}%</span>
            </div>
          )}
          {onOpenLiveView && event.cameraId && (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenLiveView(event.cameraId as string)}
                data-testid="event-viewer-open-live"
              >
                Open live view
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
