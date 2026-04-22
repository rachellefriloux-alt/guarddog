import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  History,
  Info,
  Mail,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface NotificationChannel {
  id: string;
  label: string;
  enabled: boolean;
  description?: string;
}

interface AuditEntry {
  id: string;
  at: number;
  event: string;
  detail: string;
  user?: string;
  ip?: string;
}

/**
 * Visualises the configured notification sinks and the recent audit trail.
 * The actual configuration is environment-driven (NTFY_TOPIC_URL etc.) — this
 * panel makes it easy to verify what's wired up and to fire a test event.
 */
export function NotificationsPanel() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ channels: NotificationChannel[] }>({
    queryKey: ["/api/notifications/channels"],
  });

  const test = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ results: { channel: string; ok: boolean; error?: string }[] }>;
    },
    onSuccess: (payload) => {
      const ok = payload.results.filter((r) => r.ok).length;
      const fail = payload.results.filter((r) => !r.ok);
      if (payload.results.length === 0) {
        toast({
          title: "No channels configured",
          description: "Set NTFY_TOPIC_URL or DISCORD_WEBHOOK_URL in your .env to enable notifications.",
        });
      } else {
        toast({
          title: `Test sent (${ok}/${payload.results.length} succeeded)`,
          description: fail.length
            ? fail.map((f) => `${f.channel}: ${f.error}`).join("\n")
            : "All configured channels accepted the test.",
          variant: fail.length ? "destructive" : "default",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <CardTitle>Notification fan-out</CardTitle>
        </div>
        <CardDescription>
          Outbound channels for detection alerts. Configured via environment variables — this
          panel confirms which are live and lets you fire a test event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {data?.channels.map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-3 p-3 border rounded-lg"
            data-testid={`channel-${c.id}`}
          >
            {c.enabled ? (
              <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium">{c.label}</div>
              {c.description && (
                <div className="text-xs text-muted-foreground">{c.description}</div>
              )}
            </div>
            <span className="text-xs uppercase tracking-wide">
              {c.enabled ? "active" : "off"}
            </span>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          data-testid="button-test-notifications"
        >
          {test.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send test notification
        </Button>
        {data && data.channels.every((c) => !c.enabled) && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Set <code>NTFY_TOPIC_URL</code>, <code>DISCORD_WEBHOOK_URL</code>,{" "}
              <code>PUSHOVER_USER_KEY</code>+<code>PUSHOVER_API_TOKEN</code>, or{" "}
              <code>GENERIC_WEBHOOK_URL</code> in your <code>.env</code> to enable a sink.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Recent audit log: every login, config change, share-link mint, etc.
 * Stored in a bounded ring buffer so it never exhausts memory.
 */
export function AuditLogPanel() {
  const { data, isLoading } = useQuery<{ entries: AuditEntry[] }>({
    queryKey: ["/api/audit-log"],
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <History className="h-5 w-5" />
          <CardTitle>Audit log</CardTitle>
        </div>
        <CardDescription>
          Recent security-sensitive actions. Useful for spotting anything you didn't initiate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {data && data.entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        )}
        {data && data.entries.length > 0 && (
          <ul className="divide-y text-sm" data-testid="audit-list">
            {data.entries.slice(0, 25).map((e) => (
              <li key={e.id} className="py-2 grid grid-cols-[140px_1fr] gap-3">
                <span className="text-xs text-muted-foreground">
                  {new Date(e.at).toLocaleString()}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-xs">{e.event}</div>
                  <div className="text-muted-foreground break-words">{e.detail}</div>
                  {(e.user || e.ip) && (
                    <div className="text-xs text-muted-foreground">
                      {e.user ? `${e.user} ` : ""}{e.ip ? `· ${e.ip}` : ""}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alert pipeline panel (Phase 2 wiring)
// ---------------------------------------------------------------------------

interface AlertPipelineStatus {
  enabled: boolean;
  message?: string;
  digestIntervalMs?: number;
  digestQueue?: { total: number; byCamera: Record<string, unknown[]> };
  lastDispatch?: {
    alertId: string;
    ruleId: string;
    channels: string[];
    pushOk: boolean | null;
    queuedForDigest: boolean;
  } | null;
  lastDigestFailure?: { at: number; totalAlerts: number } | null;
}

function formatInterval(ms: number | undefined): string {
  if (!ms || ms <= 0) return "—";
  const hours = Math.round(ms / 3_600_000);
  if (hours >= 1) return `every ${hours}h`;
  const mins = Math.round(ms / 60_000);
  return `every ${mins}m`;
}

/**
 * Surfaces the running AlertPipeline (router → dispatcher → digest mailer).
 * Only meaningful when the operator has set ALERTS_PIPELINE=true; otherwise
 * the panel renders an honest "disabled" state with the exact env var to
 * flip — no fake numbers, no placeholder spinners.
 */
export function AlertPipelinePanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AlertPipelineStatus>({
    queryKey: ["/api/alerts/status"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/status");
      // 503 is the documented "disabled" response — surface its body, don't throw.
      const body = (await res.json()) as AlertPipelineStatus;
      return body;
    },
    refetchInterval: 15_000,
  });

  const flush = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/alerts/digest/flush", { method: "POST" });
      const body = (await res.json()) as
        | { attempted: boolean; ok: boolean; totalAlerts?: number; details?: unknown }
        | { ok: false; message: string };
      if (!res.ok) {
        const msg = "message" in body && typeof body.message === "string"
          ? body.message
          : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return body as { attempted: boolean; ok: boolean; totalAlerts?: number };
    },
    onSuccess: (payload) => {
      if (!payload.attempted) {
        toast({
          title: "Nothing to send",
          description: "The digest queue is empty right now.",
        });
      } else {
        toast({
          title: payload.ok ? "Digest sent" : "Digest send failed",
          description: `${payload.totalAlerts ?? 0} alert(s) drained.`,
          variant: payload.ok ? "default" : "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Digest flush failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          <CardTitle>Alert pipeline</CardTitle>
        </div>
        <CardDescription>
          Matrix-driven routing, burst escalation, quiet hours, and digest mailer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-20 w-full" />}

        {data && !data.enabled && (
          <div
            className="flex items-start gap-2 p-3 border rounded-lg text-sm"
            data-testid="alert-pipeline-disabled"
          >
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">Pipeline disabled</div>
              <div className="text-muted-foreground">
                Set <code>ALERTS_PIPELINE=true</code> in your <code>.env</code> and restart to
                enable matrix-driven routing and the digest mailer. Per-channel cadence is read
                from <code>ALERT_DIGEST_HOURS</code>; outbound digest is shipped to{" "}
                <code>DIGEST_WEBHOOK_URL</code> (or held in memory if unset).
              </div>
            </div>
          </div>
        )}

        {data?.enabled && (
          <div className="space-y-3" data-testid="alert-pipeline-enabled">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 border rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Digest cadence
                </div>
                <div className="font-medium">{formatInterval(data.digestIntervalMs)}</div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Queue size
                </div>
                <div className="font-medium">
                  {data.digestQueue?.total ?? 0} alert(s) buffered
                </div>
              </div>
            </div>

            {data.lastDispatch ? (
              <div className="p-3 border rounded-lg text-sm">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Last dispatch
                </div>
                <div className="font-mono text-xs break-all">{data.lastDispatch.ruleId}</div>
                <div className="text-muted-foreground">
                  channels: {data.lastDispatch.channels.join(", ") || "—"} · push:{" "}
                  {data.lastDispatch.pushOk === null
                    ? "n/a"
                    : data.lastDispatch.pushOk
                      ? "ok"
                      : "failed"}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No alerts dispatched yet. Trigger a detection (or wait for one) to populate.
              </div>
            )}

            {data.lastDigestFailure && (
              <div className="flex items-start gap-2 p-3 border rounded-lg text-sm border-destructive/40">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                <div>
                  <div className="font-medium">Last digest send failed</div>
                  <div className="text-muted-foreground">
                    {new Date(data.lastDigestFailure.at).toLocaleString()} ·{" "}
                    {data.lastDigestFailure.totalAlerts} alert(s) held in lastFailure for retry.
                  </div>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => flush.mutate()}
              disabled={flush.isPending}
              data-testid="button-flush-digest"
            >
              {flush.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send digest now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
