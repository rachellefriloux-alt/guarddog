import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Loader2,
  RefreshCw,
  Copy,
} from "lucide-react";

import Sidebar from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface DiagnosticCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
}

interface DiagnosticsReport {
  generatedAt: string;
  hostname: string;
  platform: string;
  nodeVersion: string;
  checks: DiagnosticCheck[];
  summary: { ok: number; warn: number; fail: number; skip: number };
}

const ICON: Record<DiagnosticCheck["status"], typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  skip: MinusCircle,
};

const COLOUR: Record<DiagnosticCheck["status"], string> = {
  ok: "text-success",
  warn: "text-amber-500",
  fail: "text-destructive",
  skip: "text-muted-foreground",
};

export default function DiagnosticsPage() {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);

  const { data, isLoading, isFetching } = useQuery<DiagnosticsReport>({
    queryKey: ["/api/diagnostics"],
  });

  const rerun = useMutation({
    mutationFn: () => queryClient.invalidateQueries({ queryKey: ["/api/diagnostics"] }),
  });

  const copyReport = async () => {
    if (!data) return;
    setCopying(true);
    try {
      const lines = [
        `GuardDog Diagnostics Report`,
        `Generated: ${data.generatedAt}`,
        `Host: ${data.hostname} (${data.platform})`,
        `Node: ${data.nodeVersion}`,
        `Summary: ok=${data.summary.ok} warn=${data.summary.warn} fail=${data.summary.fail} skip=${data.summary.skip}`,
        ``,
        ...data.checks.map((c) => `[${c.status.toUpperCase()}] ${c.label}: ${c.detail}`),
      ];
      await navigator.clipboard.writeText(lines.join("\n"));
      toast({ title: "Copied", description: "Diagnostics report copied to clipboard." });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Diagnostics</h1>
            <p className="text-muted-foreground">
              One-click health check across every GuardDog subsystem.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => rerun.mutate()} disabled={isFetching} variant="outline">
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Re-run
            </Button>
            <Button onClick={copyReport} disabled={!data || copying}>
              <Copy className="mr-2 h-4 w-4" /> Copy report
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <SummaryCard label="OK" value={data.summary.ok} className="text-success" />
              <SummaryCard label="Warn" value={data.summary.warn} className="text-amber-500" />
              <SummaryCard label="Fail" value={data.summary.fail} className="text-destructive" />
              <SummaryCard label="Skip" value={data.summary.skip} className="text-muted-foreground" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Checks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.checks.map((check) => {
                  const Icon = ICON[check.status];
                  return (
                    <div
                      key={check.id}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                      data-testid={`diag-check-${check.id}`}
                    >
                      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${COLOUR[check.status]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{check.label}</div>
                        <div className="text-sm text-muted-foreground break-words">
                          {check.detail}
                        </div>
                      </div>
                      <span
                        className={`text-xs uppercase tracking-wide font-semibold ${COLOUR[check.status]}`}
                      >
                        {check.status}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground mt-4">
              Generated {new Date(data.generatedAt).toLocaleString()} · {data.hostname} · Node{" "}
              {data.nodeVersion}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-2xl font-bold ${className ?? ""}`}>{value}</span>
      </CardContent>
    </Card>
  );
}
