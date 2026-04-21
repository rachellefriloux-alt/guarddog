/**
 * Stream health badge driven by GET /api/streams/health. Green when the
 * recorder is producing fresh segments, amber after a recent reconnect, red
 * when the stream is down. Shown next to each camera in the cameras list.
 */
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StreamHealth {
  name: string;
  status: "ok" | "degraded" | "down";
  lastSegmentAt?: number;
  secondsSinceLastSegment: number | null;
  reconnectAttempts: number;
  reconnectsLastHour: number;
  lastError?: string;
}

interface StreamHealthResponse {
  streams: StreamHealth[];
}

const colourFor: Record<StreamHealth["status"], string> = {
  ok: "bg-success",
  degraded: "bg-amber-500",
  down: "bg-destructive",
};

const labelFor: Record<StreamHealth["status"], string> = {
  ok: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

function formatRelative(seconds: number | null): string {
  if (seconds == null) return "no segments yet";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

interface StreamHealthBadgeProps {
  cameraName: string;
  className?: string;
}

export function StreamHealthBadge({ cameraName, className }: StreamHealthBadgeProps) {
  const { data } = useQuery<StreamHealthResponse>({
    queryKey: ["/api/streams/health"],
    refetchInterval: 10_000,
  });

  const stream = data?.streams.find((s) => s.name === cameraName);
  if (!stream) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn("inline-flex items-center gap-1.5 text-xs", className)}
            data-testid="health-badge-idle"
          >
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="text-muted-foreground">Not recording</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>This camera isn't part of the sovereign recorder yet.</TooltipContent>
      </Tooltip>
    );
  }

  const tooltipBody = (
    <div className="text-xs space-y-0.5">
      <div>Last segment: {formatRelative(stream.secondsSinceLastSegment)}</div>
      <div>Reconnects (1 h): {stream.reconnectsLastHour}</div>
      {stream.lastError && <div className="text-destructive">Last error: {stream.lastError}</div>}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center gap-1.5 text-xs", className)}
          data-testid={`health-badge-${stream.status}`}
        >
          <span className={cn("w-2 h-2 rounded-full status-indicator", colourFor[stream.status])} />
          <span>{labelFor[stream.status]}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipBody}</TooltipContent>
    </Tooltip>
  );
}
