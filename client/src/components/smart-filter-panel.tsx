import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SmartRule {
  detection: string;
  cameraFilter?: string;
  timeWindow?: { start: string; end: string };
  minConfidence?: number;
  message: string;
}

interface ParseResult {
  rule: SmartRule;
  source: "ai" | "fallback";
  prompt: string;
}

const EXAMPLES = [
  "Notify me when a person is on the driveway between 10pm and 6am",
  "Alert when a vehicle arrives at the garage",
  "Tell me about package deliveries at the front door",
  "Any motion in the backyard after midnight",
];

/**
 * Lets users describe alert rules in plain English. The server uses the
 * active AI provider (Ollama or OpenAI) to translate them into structured
 * rules; if neither is available a deterministic fallback parser handles the
 * common cases so the feature still works.
 */
export function SmartFilterPanel() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);

  const submit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/smart-filter/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      toast({
        title: "Couldn't parse the rule",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="smart-filter-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> AI smart filters
        </CardTitle>
        <CardDescription>
          Describe an alert rule in plain English. We'll convert it to a structured rule using
          the active AI provider (Ollama / OpenAI / fallback).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Notify me when a person is on the driveway between 10pm and 6am"
          rows={3}
          data-testid="smart-filter-input"
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="text-xs px-2 py-1 rounded-full border hover:bg-accent text-muted-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button onClick={submit} disabled={loading || !prompt.trim()} data-testid="smart-filter-submit">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing…
            </>
          ) : (
            "Parse rule"
          )}
        </Button>

        {result && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Parsed rule</span>
              <span className="text-xs text-muted-foreground">
                {result.source === "ai" ? "via AI provider" : "via fallback parser"}
              </span>
            </div>
            <div><strong>Detect:</strong> {result.rule.detection}</div>
            {result.rule.cameraFilter && (
              <div><strong>Camera filter:</strong> {result.rule.cameraFilter}</div>
            )}
            {result.rule.timeWindow && (
              <div>
                <strong>Time window:</strong> {result.rule.timeWindow.start} – {result.rule.timeWindow.end}
              </div>
            )}
            {result.rule.minConfidence != null && (
              <div><strong>Min confidence:</strong> {(result.rule.minConfidence * 100).toFixed(0)}%</div>
            )}
            <div><strong>Message:</strong> {result.rule.message}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
