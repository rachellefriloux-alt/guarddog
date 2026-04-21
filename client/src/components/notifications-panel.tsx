import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  History,
  Info,
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
