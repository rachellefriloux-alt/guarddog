import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Cameras from "@/pages/cameras";
import Recordings from "@/pages/recordings";
import CloudStorage from "@/pages/cloud-storage";
import AIDetection from "@/pages/ai-detection";
import Alerts from "@/pages/alerts";
import EventsPage from "@/pages/events";
import Settings from "@/pages/settings";
import Diagnostics from "@/pages/diagnostics";
import ParityDashboard from "@/pages/parity-dashboard";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LoginScreen } from "@/components/login-screen";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "@/components/theme-provider";
import { CommandPalette } from "@/components/command-palette";
import { HelpDrawer } from "@/components/help-drawer";
import { FirstRunWizard } from "@/components/first-run-wizard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/cameras" component={Cameras} />
      <Route path="/recordings" component={Recordings} />
      <Route path="/cloud-storage" component={CloudStorage} />
      <Route path="/ai-detection" component={AIDetection} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/events" component={EventsPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/diagnostics" component={Diagnostics} />
      <Route path="/parity-dashboard" component={ParityDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedShell() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [, navigate] = useLocation();

  return (
    <>
      <Router />
      <CommandPalette
        onAddCamera={() => navigate("/cameras")}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <HelpDrawer open={helpOpen} onOpenChange={setHelpOpen} />
      <FirstRunWizard onAddCamera={() => navigate("/cameras")} />
    </>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Checking your GuardDog session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AuthenticatedShell />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AuthGate />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
