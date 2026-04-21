import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Cloud, Cog, Sparkles, Video, Bell } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "guarddog.firstRun.completed";

interface NotificationChannel {
  id: string;
  label: string;
  enabled: boolean;
  description?: string;
}

/**
 * Friendly post-login orientation. Shown once when there are no cameras
 * configured. Replaces the old "edit JSON files" experience.
 */
export function FirstRunWizard({ onAddCamera }: { onAddCamera: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const { data: cameras } = useQuery<unknown[]>({
    queryKey: ["/api/cameras"],
  });
  const { data: channels } = useQuery<{ channels: NotificationChannel[] }>({
    queryKey: ["/api/notifications/channels"],
  });
  const { data: aiStatus } = useQuery<{ provider: string }>({
    queryKey: ["/api/ai/status"],
  });

  useEffect(() => {
    if (cameras === undefined) return;
    const completed = window.localStorage.getItem(STORAGE_KEY) === "true";
    if (!completed && cameras.length === 0) {
      setOpen(true);
    }
  }, [cameras]);

  const finish = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  };

  const enabledChannels = channels?.channels.filter((c) => c.enabled) ?? [];

  const steps = [
    {
      icon: Sparkles,
      title: "Welcome to GuardDog",
      body: (
        <p className="text-sm text-muted-foreground leading-relaxed">
          GuardDog is a self-hosted surveillance dashboard that records straight to your own
          storage and runs detection locally when possible. This 4-step tour gets you from
          zero to recording.
        </p>
      ),
    },
    {
      icon: Video,
      title: "Add your first camera",
      body: (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Click <strong>Add a camera</strong> on the Cameras page. The wizard will scan your
            network for ONVIF devices, pre-fill the RTSP URL based on your camera vendor, and
            verify the stream with ffprobe before saving.
          </p>
          <Button
            onClick={() => {
              finish();
              onAddCamera();
            }}
            data-testid="first-run-add-camera"
          >
            Open the camera wizard
          </Button>
        </div>
      ),
    },
    {
      icon: Cloud,
      title: "Storage destination",
      body: (
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            By default GuardDog writes 10-minute MP4 segments into the auto-detected OneDrive
            folder. To use a different destination, set <code>SOVEREIGN_STORAGE_PATH</code> in
            your <code>.env</code> (or <code>STORAGE_DIR</code> for purely local).
          </p>
          <p>
            Set <code>STORAGE_MAX_GB</code> to enforce a hard disk-usage cap — GuardDog will
            prune the oldest segments first.
          </p>
        </div>
      ),
    },
    {
      icon: Cog,
      title: "AI provider",
      body: (
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Active provider: <strong>{aiStatus?.provider ?? "unknown"}</strong>
          </p>
          <p>
            For free local detection, install Ollama and run <code>ollama pull llava</code>.
            For higher accuracy, set <code>OPENAI_API_KEY</code>. You can change this any time
            in Settings.
          </p>
        </div>
      ),
    },
    {
      icon: Bell,
      title: "Notifications",
      body: (
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            {enabledChannels.length === 0 ? (
              <>
                No notification sinks configured yet. Set <code>NTFY_TOPIC_URL</code>,{" "}
                <code>DISCORD_WEBHOOK_URL</code>, <code>PUSHOVER_USER_KEY</code>, or{" "}
                <code>GENERIC_WEBHOOK_URL</code> in your <code>.env</code> to receive alerts
                outside the app.
              </>
            ) : (
              <>
                You're set up to receive alerts via:{" "}
                <strong>{enabledChannels.map((c) => c.label).join(", ")}</strong>.
              </>
            )}
          </p>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {current.title}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">{current.body}</div>
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                      ? "w-1.5 bg-success"
                      : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={finish}>
              Skip tour
            </Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
