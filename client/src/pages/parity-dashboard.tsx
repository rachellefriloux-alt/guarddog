import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, PauseCircle, Target } from "lucide-react";

import Sidebar from "@/components/sidebar";
import Header from "@/components/header";
import CameraSettingsModal from "@/components/camera-settings-modal";
import AccountLoginModal from "@/components/account-login-modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Priority = "Must" | "Should" | "Later";
type Status = "Completed" | "In progress" | "Deferred";
type Phase = "MVP parity" | "Advanced AI parity" | "Premium enhancements";
type Source = "Ring" | "eSeeCloud" | "Both";

interface FeatureItem {
  capability: string;
  source: Source;
  priority: Priority;
  phase: Phase;
  status: Status;
}

interface PhaseGate {
  phase: Phase;
  status: Status;
  gate: string;
}

const FEATURE_MATRIX: FeatureItem[] = [
  { capability: "Live camera view", source: "Both", priority: "Must", phase: "MVP parity", status: "Completed" },
  { capability: "Two-way audio", source: "Both", priority: "Must", phase: "MVP parity", status: "In progress" },
  { capability: "History timeline playback", source: "Both", priority: "Must", phase: "MVP parity", status: "In progress" },
  { capability: "Event filtering", source: "Both", priority: "Must", phase: "MVP parity", status: "In progress" },
  { capability: "Multi-device management", source: "Both", priority: "Must", phase: "MVP parity", status: "In progress" },
  { capability: "Account + device onboarding", source: "Both", priority: "Must", phase: "MVP parity", status: "In progress" },
  { capability: "Remote camera settings", source: "Both", priority: "Must", phase: "MVP parity", status: "In progress" },
  { capability: "Person detection", source: "Both", priority: "Must", phase: "Advanced AI parity", status: "Completed" },
  { capability: "Vehicle detection", source: "Both", priority: "Must", phase: "Advanced AI parity", status: "Completed" },
  { capability: "Pet detection", source: "Both", priority: "Should", phase: "Advanced AI parity", status: "Completed" },
  { capability: "Package detection", source: "Ring", priority: "Should", phase: "Advanced AI parity", status: "In progress" },
  { capability: "Zone-based detection", source: "Both", priority: "Must", phase: "Advanced AI parity", status: "In progress" },
  { capability: "Doorbell event detection", source: "Ring", priority: "Must", phase: "Advanced AI parity", status: "In progress" },
  { capability: "Smart AI summaries", source: "Both", priority: "Should", phase: "Advanced AI parity", status: "Completed" },
  { capability: "False-alert controls", source: "Both", priority: "Should", phase: "Advanced AI parity", status: "In progress" },
  { capability: "Priority alert routing", source: "Both", priority: "Should", phase: "Advanced AI parity", status: "In progress" },
  { capability: "Rapid motion response workflow", source: "Ring", priority: "Should", phase: "Premium enhancements", status: "In progress" },
  { capability: "Rich event snapshots", source: "Ring", priority: "Should", phase: "Premium enhancements", status: "Completed" },
  { capability: "Emergency escalation paths", source: "Ring", priority: "Should", phase: "Premium enhancements", status: "In progress" },
  { capability: "Household/shared access roles", source: "Ring", priority: "Must", phase: "Premium enhancements", status: "In progress" },
  { capability: "Offline handling mode", source: "Both", priority: "Must", phase: "Premium enhancements", status: "In progress" },
  { capability: "Device health checks", source: "Both", priority: "Must", phase: "Premium enhancements", status: "Completed" },
  { capability: "Storage/retention controls", source: "Both", priority: "Must", phase: "Premium enhancements", status: "Completed" },
  { capability: "Backup and sync options", source: "Both", priority: "Must", phase: "Premium enhancements", status: "Completed" },
  { capability: "Admin diagnostics", source: "Both", priority: "Must", phase: "Premium enhancements", status: "Completed" },
  { capability: "Encrypted transport", source: "Both", priority: "Must", phase: "Premium enhancements", status: "Completed" },
  { capability: "Encryption at rest", source: "Both", priority: "Must", phase: "Premium enhancements", status: "In progress" },
  { capability: "Strong authentication", source: "Both", priority: "Must", phase: "Premium enhancements", status: "In progress" },
  { capability: "Session/device management", source: "Both", priority: "Should", phase: "Premium enhancements", status: "In progress" },
  { capability: "Audit visibility", source: "Both", priority: "Must", phase: "Premium enhancements", status: "Completed" },
];

const PHASE_GATES: PhaseGate[] = [
  {
    phase: "MVP parity",
    status: "In progress",
    gate: "Native iOS + Android app shell, notifications, playback, and baseline onboarding verified on real devices.",
  },
  {
    phase: "Advanced AI parity",
    status: "In progress",
    gate: "Detection quality and alert latency pass acceptance checks for person/vehicle/package/pet and zone tuning.",
  },
  {
    phase: "Premium enhancements",
    status: "In progress",
    gate: "Safety workflows, reliability controls, privacy/security hardening, and role-sharing pass release criteria.",
  },
];

function statusClass(status: Status) {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "In progress") return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
}

function priorityClass(priority: Priority) {
  if (priority === "Must") return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300";
  if (priority === "Should") return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
}

export default function ParityDashboard() {
  const [layout, setLayout] = useState<"2x2" | "3x3" | "4x4">("2x2");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const stats = useMemo(() => {
    const counts = FEATURE_MATRIX.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "Completed") acc.completed += 1;
        if (item.status === "In progress") acc.inProgress += 1;
        if (item.status === "Deferred") acc.deferred += 1;
        return acc;
      },
      { total: 0, completed: 0, inProgress: 0, deferred: 0 },
    );

    return {
      ...counts,
      completionPercent: Math.round((counts.completed / counts.total) * 100),
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <Header
          layout={layout}
          onLayoutChange={setLayout}
          onAddCamera={() => setIsModalOpen(true)}
          onOpenAccountSettings={() => setIsAccountModalOpen(true)}
        />

        <main className="flex-1 p-6 overflow-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">eSeeCloud + Ring Parity Dashboard</h1>
            <p className="text-muted-foreground">
              Unified feature matrix with Must/Should/Later priorities, phased delivery gates, and current status tracking.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total capabilities</CardDescription>
                <CardTitle className="text-3xl">{stats.total}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Combined user-facing features from both ecosystems.</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completed</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  {stats.completed}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{stats.completionPercent}% complete</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>In progress</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-amber-500" />
                  {stats.inProgress}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Active implementation workstreams.</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Deferred</CardDescription>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <PauseCircle className="h-5 w-5 text-slate-500" />
                  {stats.deferred}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Intentionally scheduled for later.</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Phase rollout gates
              </CardTitle>
              <CardDescription>Each phase must pass QA, latency, battery/network, and release criteria before promotion.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PHASE_GATES.map((phase) => (
                <div key={phase.phase} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{phase.phase}</span>
                    <Badge variant="outline" className={statusClass(phase.status)}>
                      {phase.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{phase.gate}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feature parity matrix</CardTitle>
              <CardDescription>Tracks every feature requested across eSeeCloud AI + Ring with priority and delivery phase.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Capability</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FEATURE_MATRIX.map((item) => (
                    <TableRow key={item.capability}>
                      <TableCell className="font-medium">{item.capability}</TableCell>
                      <TableCell>{item.source}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={priorityClass(item.priority)}>
                          {item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.phase}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusClass(item.status)}>
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>

      <CameraSettingsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <AccountLoginModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </div>
  );
}
