import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const HELP_TOPICS: { id: string; title: string; body: string }[] = [
  {
    id: "cameras",
    title: "Connecting cameras",
    body:
      "Use the Cameras page → Add Camera. The wizard can scan your network for ONVIF devices, or you can pick a vendor preset (Hikvision, Dahua, Reolink, eSeeCloud, etc.) and just type the IP and password — GuardDog fills in the RTSP URL for you and validates it with ffprobe before saving.",
  },
  {
    id: "recording",
    title: "Recording & storage",
    body:
      "GuardDog's sovereign recorder copies the camera's H.264 stream straight into 10-minute MP4 segments — zero re-encoding, zero CPU. Segments land in your OneDrive folder by default; override with SOVEREIGN_STORAGE_PATH. Set STORAGE_MAX_GB to enforce a hard disk cap.",
  },
  {
    id: "ai",
    title: "AI detection",
    body:
      "Three providers, in priority order: a local Ollama install (free), OpenAI (paid), or disabled. Run `ollama pull llava` to enable vision detection without sending frames to the cloud. The MQTT bridge can also import detections from Frigate.",
  },
  {
    id: "notifications",
    title: "Notifications",
    body:
      "Set NTFY_TOPIC_URL, DISCORD_WEBHOOK_URL, PUSHOVER_USER_KEY/PUSHOVER_API_TOKEN, or GENERIC_WEBHOOK_URL. Multiple sinks can run in parallel. Test them from Settings → Notifications.",
  },
  {
    id: "diagnostics",
    title: "When something breaks",
    body:
      "Settings → Diagnostics runs a one-shot health check across ffmpeg, storage, AI provider, MQTT, and OneDrive. Copy the report into a support thread — it's the fastest way to triage.",
  },
  {
    id: "share",
    title: "Sharing a clip",
    body:
      "Open a recording → Share. GuardDog generates a signed URL that expires in 7 days (configurable up to 90). Anyone with the link can download that single clip without an account.",
  },
];

interface HelpDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Side drawer with bite-sized "how this works" topics. Sourced from the same
 * docs that ship in the repo so they don't drift from the codebase.
 */
export function HelpDrawer({ open, onOpenChange }: HelpDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[450px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Help & how-to</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-4">
          {HELP_TOPICS.map((topic) => (
            <article key={topic.id} className="space-y-1">
              <h3 className="font-semibold text-base">{topic.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{topic.body}</p>
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
