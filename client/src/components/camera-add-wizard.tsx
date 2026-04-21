import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Camera as CameraIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Radar,
  X,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type InsertCamera } from "@shared/schema";

interface CameraPreset {
  id: string;
  label: string;
  urlTemplate: string;
  subStreamTemplate?: string;
  defaultPort: number;
  defaultUsername?: string;
  notes?: string;
}

interface DiscoveredDevice {
  address: string;
  xAddrs: string[];
  scopes: string[];
  label?: string;
}

interface TestResult {
  ok: boolean;
  error?: string;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  advisory?: string;
}

type Step = "vendor" | "connection" | "test" | "save";

interface WizardState {
  presetId: string;
  name: string;
  ip: string;
  port: string;
  username: string;
  password: string;
  channel: string;
  location: string;
  streamUrl: string;
  useSubStream: boolean;
}

interface CameraAddWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

function applyTemplate(
  template: string,
  values: { ip: string; port: string; user: string; pass: string; channel: string },
): string {
  return template
    .replace(/\{ip\}/g, values.ip)
    .replace(/\{port\}/g, values.port)
    .replace(/\{user\}/g, encodeURIComponent(values.user))
    .replace(/\{pass\}/g, encodeURIComponent(values.pass))
    .replace(/\{channel\}/g, values.channel || "1");
}

const STEPS: { id: Step; label: string }[] = [
  { id: "vendor", label: "Vendor" },
  { id: "connection", label: "Connection" },
  { id: "test", label: "Test" },
  { id: "save", label: "Save" },
];

export default function CameraAddWizard({ isOpen, onClose }: CameraAddWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("vendor");
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [state, setState] = useState<WizardState>({
    presetId: "generic-onvif",
    name: "",
    ip: "",
    port: "554",
    username: "admin",
    password: "",
    channel: "1",
    location: "",
    streamUrl: "",
    useSubStream: false,
  });

  const { data: presetData } = useQuery<{ presets: CameraPreset[] }>({
    queryKey: ["/api/cameras/vendor-presets"],
    enabled: isOpen,
  });
  const presets = presetData?.presets ?? [];
  const activePreset = presets.find((p) => p.id === state.presetId);

  // Recompute the stream URL whenever the relevant inputs change.
  useEffect(() => {
    if (!activePreset) return;
    const template = state.useSubStream && activePreset.subStreamTemplate
      ? activePreset.subStreamTemplate
      : activePreset.urlTemplate;
    setState((s) => ({
      ...s,
      streamUrl: applyTemplate(template, {
        ip: s.ip,
        port: s.port || String(activePreset.defaultPort),
        user: s.username,
        pass: s.password,
        channel: s.channel,
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.presetId,
    state.ip,
    state.port,
    state.username,
    state.password,
    state.channel,
    state.useSubStream,
    activePreset?.id,
  ]);

  const reset = () => {
    setStep("vendor");
    setDiscovering(false);
    setDiscovered([]);
    setTestResult(null);
    setTesting(false);
    setState({
      presetId: "generic-onvif",
      name: "",
      ip: "",
      port: "554",
      username: "admin",
      password: "",
      channel: "1",
      location: "",
      streamUrl: "",
      useSubStream: false,
    });
  };

  const handleClose = () => {
    if (createMutation.isPending || testing) return;
    onClose();
    reset();
  };

  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      const res = await fetch("/api/cameras/discover");
      const json = await res.json();
      setDiscovered(json.devices ?? []);
      if ((json.devices ?? []).length === 0) {
        toast({
          title: "No cameras responded",
          description:
            "Multicast may be blocked on your network, or the cameras may not support ONVIF discovery. You can still enter the IP manually.",
        });
      }
    } catch (err) {
      toast({
        title: "Discovery failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setDiscovering(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cameras/test-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: state.streamUrl,
          username: state.username,
          password: state.password,
        }),
      });
      const json: TestResult = await res.json();
      setTestResult(json);
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertCamera) => apiRequest("POST", "/api/cameras", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      toast({
        title: "Camera added",
        description: `${state.name} is now part of GuardDog.`,
      });
      handleClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add camera",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const submit = () => {
    const camera: InsertCamera = {
      name: state.name,
      type: state.presetId === "ring" ? "ring" : state.presetId === "esee-cloud" ? "esee" : "generic",
      ipAddress: state.ip,
      port: state.port,
      streamUrl: state.streamUrl,
      username: state.username,
      password: state.password,
      location: state.location || state.name.toLowerCase().replace(/\s+/g, "_"),
      resolution: testResult?.resolution || "1080p",
      isOnline: true,
      wifiStrength: 100,
      aiDetectionEnabled: true,
      detectPeople: true,
      detectPets: true,
      detectVehicles: false,
      isRecording: true,
    };
    createMutation.mutate(camera);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const canProceed = (): boolean => {
    switch (step) {
      case "vendor":
        return Boolean(state.presetId);
      case "connection":
        return Boolean(state.name && state.ip && state.streamUrl);
      case "test":
        return Boolean(testResult?.ok);
      case "save":
        return Boolean(state.name && state.location);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="camera-add-wizard"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Add a camera
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              disabled={createMutation.isPending}
              aria-label="Close"
            >
              <X size={20} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-2 mb-4 text-sm" aria-label="Wizard progress">
          {STEPS.map((s, idx) => {
            const isActive = idx === stepIndex;
            const isDone = idx < stepIndex;
            return (
              <li key={s.id} className="flex items-center gap-2 flex-1">
                <span
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-success text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </span>
                <span className={isActive ? "font-medium" : "text-muted-foreground"}>
                  {s.label}
                </span>
                {idx < STEPS.length - 1 && <span className="flex-1 h-px bg-border" />}
              </li>
            );
          })}
        </ol>

        {/* Step bodies */}
        {step === "vendor" && (
          <div className="space-y-4">
            <div>
              <Label>Camera vendor / family</Label>
              <Select
                value={state.presetId}
                onValueChange={(v) => {
                  const preset = presets.find((p) => p.id === v);
                  setState((s) => ({
                    ...s,
                    presetId: v,
                    port: preset ? String(preset.defaultPort || s.port) : s.port,
                    username: preset?.defaultUsername || s.username,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activePreset?.notes && (
                <p className="mt-2 text-sm text-muted-foreground">{activePreset.notes}</p>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Radar className="h-4 w-4" /> Auto-discover cameras on this network
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sends a one-time WS-Discovery probe. Devices that respond appear below.
                  </p>
                </div>
                <Button onClick={runDiscovery} disabled={discovering} variant="outline">
                  {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan"}
                </Button>
              </div>
              {discovered.length > 0 && (
                <ul className="space-y-1.5 max-h-40 overflow-auto">
                  {discovered.map((d) => (
                    <li
                      key={d.address}
                      className="flex items-center justify-between p-2 rounded border hover:bg-accent cursor-pointer"
                      onClick={() => {
                        setState((s) => ({ ...s, ip: d.address, name: s.name || d.label || d.address }));
                        toast({ title: `Selected ${d.address}`, description: "IP populated. Continue to set credentials." });
                      }}
                    >
                      <span className="font-mono text-sm">{d.address}</span>
                      {d.label && <span className="text-xs text-muted-foreground">{d.label}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === "connection" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={state.name}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Front door"
                  data-testid="wizard-name"
                />
              </div>
              <div>
                <Label>IP address</Label>
                <Input
                  value={state.ip}
                  onChange={(e) => setState((s) => ({ ...s, ip: e.target.value }))}
                  placeholder="192.168.1.50"
                  data-testid="wizard-ip"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  value={state.port}
                  onChange={(e) => setState((s) => ({ ...s, port: e.target.value }))}
                />
              </div>
              <div>
                <Label>Channel</Label>
                <Input
                  value={state.channel}
                  onChange={(e) => setState((s) => ({ ...s, channel: e.target.value }))}
                />
              </div>
              <div>
                <Label>Username</Label>
                <Input
                  value={state.username}
                  onChange={(e) => setState((s) => ({ ...s, username: e.target.value }))}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={state.password}
                  onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Stream URL (auto-generated, edit if your camera uses a custom path)</Label>
              <Input
                value={state.streamUrl}
                onChange={(e) => setState((s) => ({ ...s, streamUrl: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            {activePreset?.subStreamTemplate && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.useSubStream}
                  onChange={(e) => setState((s) => ({ ...s, useSubStream: e.target.checked }))}
                />
                Use the sub-stream (lower bitrate, recommended for cloud sync)
              </label>
            )}
          </div>
        )}

        {step === "test" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We'll probe <span className="font-mono">{state.streamUrl}</span> with ffprobe to verify
              the camera is reachable and the credentials work.
            </p>
            <Button onClick={runTest} disabled={testing}>
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing…
                </>
              ) : (
                "Run test"
              )}
            </Button>
            {testResult?.ok && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Stream is healthy</AlertTitle>
                <AlertDescription>
                  <div className="text-sm space-y-1 mt-1">
                    {testResult.resolution && <div>Resolution: {testResult.resolution}</div>}
                    {testResult.fps && <div>Frame rate: {testResult.fps} fps</div>}
                    {testResult.videoCodec && <div>Video codec: {testResult.videoCodec}</div>}
                    {testResult.bitrateKbps != null && (
                      <div>Bitrate: {testResult.bitrateKbps} kbps</div>
                    )}
                    {testResult.advisory && (
                      <div className="text-amber-700 dark:text-amber-400">
                        {testResult.advisory}
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {testResult && !testResult.ok && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Couldn't connect</AlertTitle>
                <AlertDescription className="text-sm">
                  {testResult.error || "Unknown error"}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === "save" && (
          <div className="space-y-4">
            <Alert>
              <CameraIcon className="h-4 w-4" />
              <AlertTitle>Almost done</AlertTitle>
              <AlertDescription>Review and confirm before adding this camera.</AlertDescription>
            </Alert>
            <div className="text-sm space-y-2">
              <div><strong>Name:</strong> {state.name}</div>
              <div><strong>Vendor:</strong> {activePreset?.label}</div>
              <div><strong>Stream:</strong> <span className="font-mono text-xs">{state.streamUrl}</span></div>
              <div>
                <Label>Location label (used in alerts)</Label>
                <Input
                  value={state.location}
                  onChange={(e) => setState((s) => ({ ...s, location: e.target.value }))}
                  placeholder="front_door"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => {
              const idx = STEPS.findIndex((s) => s.id === step);
              if (idx > 0) setStep(STEPS[idx - 1].id);
            }}
            disabled={stepIndex === 0 || createMutation.isPending}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {step !== "save" ? (
            <Button
              onClick={() => {
                const idx = STEPS.findIndex((s) => s.id === step);
                if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
              }}
              disabled={!canProceed()}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!canProceed() || createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add camera"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
