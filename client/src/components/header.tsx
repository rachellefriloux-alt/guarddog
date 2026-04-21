import { Plus, Settings, HelpCircle, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { HelpDrawer } from '@/components/help-drawer';

interface HeaderProps {
  layout: '2x2' | '3x3' | '4x4';
  onLayoutChange: (layout: '2x2' | '3x3' | '4x4') => void;
  onAddCamera: () => void;
  onOpenAccountSettings: () => void;
}

export default function Header({ layout, onLayoutChange, onAddCamera, onOpenAccountSettings }: HeaderProps) {
  const { user } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  const layoutOptions: Array<'2x2' | '3x3' | '4x4'> = ['2x2', '3x3', '4x4'];

  const userInitials = (user?.name || user?.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Cross-platform shortcut hint — ⌘ on macOS, Ctrl elsewhere.
  const shortcutLabel =
    typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-sans">Dashboard</h2>
          <p className="text-muted-foreground">Monitor your cameras in real-time</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Cmd-K hint */}
          <button
            type="button"
            onClick={() => {
              // Match the platform — synthesizing both modifiers can fire the
              // listener twice on systems that observe each one separately.
              const isMac =
                typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
              const evt = new KeyboardEvent('keydown', {
                key: 'k',
                metaKey: isMac,
                ctrlKey: !isMac,
                bubbles: true,
              });
              window.dispatchEvent(evt);
            }}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/50 text-sm text-muted-foreground hover:bg-muted transition-colors"
            aria-label={`Open command palette (${shortcutLabel})`}
            data-testid="button-command-palette"
          >
            <Search size={14} />
            <span>Search…</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-background border text-xs font-mono">{shortcutLabel}</kbd>
          </button>

          {/* Layout Controls */}
          <div className="flex bg-muted rounded-lg p-1" data-testid="layout-controls">
            {layoutOptions.map((option) => (
              <button
                key={option}
                data-testid={`layout-${option}`}
                onClick={() => onLayoutChange(option)}
                className={cn(
                  "px-3 py-1 rounded text-sm font-medium transition-colors",
                  layout === option
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {/* Add Camera Button */}
          <Button
            onClick={onAddCamera}
            className="bg-secondary text-secondary-foreground hover:opacity-90"
            data-testid="button-add-camera"
          >
            <Plus className="mr-2" size={16} />
            Add Camera
          </Button>

          {/* Account Settings Button */}
          <Button
            variant="outline"
            onClick={onOpenAccountSettings}
            data-testid="button-account-settings"
          >
            <Settings className="mr-2" size={16} />
            Accounts
          </Button>

          {/* Help */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHelpOpen(true)}
            aria-label="Help"
            data-testid="button-help"
          >
            <HelpCircle size={20} />
          </Button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          <div className="flex items-center space-x-2" data-testid="user-menu">
            <Avatar className="h-9 w-9">
              {user?.picture ? (
                <AvatarImage src={user.picture} alt={user?.name ?? user?.email ?? 'GuardDog user'} />
              ) : (
                <AvatarFallback>{userInitials}</AvatarFallback>
              )}
            </Avatar>
            <div className="flex flex-col leading-tight">
              <span className="font-medium text-sm">{user?.name ?? user?.email ?? 'GuardDog User'}</span>
              {user?.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
            </div>
          </div>
        </div>
      </div>
      <HelpDrawer open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}
