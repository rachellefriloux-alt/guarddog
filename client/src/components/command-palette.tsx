import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  Brain,
  Cloud,
  Grid,
  HelpCircle,
  PlayCircle,
  Plus,
  Settings as SettingsIcon,
  Stethoscope,
  Video,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface CommandPaletteProps {
  /** Optional callback when the user picks "Add camera" so the host page can
   *  open its wizard. */
  onAddCamera?: () => void;
  /** Optional callback to open the in-app help drawer. */
  onOpenHelp?: () => void;
}

/**
 * Cmd-K / Ctrl-K command palette. Lets power users jump anywhere in the app,
 * trigger common actions (run diagnostics, mute alerts), and find pages
 * without using the sidebar.
 */
export function CommandPalette({ onAddCamera, onOpenHelp }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/")}><Grid className="mr-2 h-4 w-4" /> Dashboard</CommandItem>
          <CommandItem onSelect={() => go("/cameras")}><Video className="mr-2 h-4 w-4" /> Cameras</CommandItem>
          <CommandItem onSelect={() => go("/recordings")}><PlayCircle className="mr-2 h-4 w-4" /> Recordings</CommandItem>
          <CommandItem onSelect={() => go("/alerts")}><Bell className="mr-2 h-4 w-4" /> Alerts</CommandItem>
          <CommandItem onSelect={() => go("/ai-detection")}><Brain className="mr-2 h-4 w-4" /> AI Detection</CommandItem>
          <CommandItem onSelect={() => go("/cloud-storage")}><Cloud className="mr-2 h-4 w-4" /> Cloud Storage</CommandItem>
          <CommandItem onSelect={() => go("/settings")}><SettingsIcon className="mr-2 h-4 w-4" /> Settings</CommandItem>
          <CommandItem onSelect={() => go("/diagnostics")}><Stethoscope className="mr-2 h-4 w-4" /> Diagnostics</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {onAddCamera && (
            <CommandItem
              onSelect={() => {
                setOpen(false);
                onAddCamera();
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add a camera
            </CommandItem>
          )}
          {onOpenHelp && (
            <CommandItem
              onSelect={() => {
                setOpen(false);
                onOpenHelp();
              }}
            >
              <HelpCircle className="mr-2 h-4 w-4" /> Open help
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
