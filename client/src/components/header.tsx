import { Plus, Moon, Sun, User, Settings } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HeaderProps {
  layout: '2x2' | '3x3' | '4x4';
  onLayoutChange: (layout: '2x2' | '3x3' | '4x4') => void;
  onAddCamera: () => void;
  onOpenAccountSettings: () => void;
}

export default function Header({ layout, onLayoutChange, onAddCamera, onOpenAccountSettings }: HeaderProps) {
  const { isDark, toggleTheme } = useTheme();

  const layoutOptions: Array<'2x2' | '3x3' | '4x4'> = ['2x2', '3x3', '4x4'];

  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-sans">Dashboard</h2>
          <p className="text-muted-foreground">Monitor your cameras in real-time</p>
        </div>
        
        <div className="flex items-center space-x-4">
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

          {/* Dark Mode Toggle */}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </Button>

          {/* User Menu */}
          <div className="flex items-center space-x-2" data-testid="user-menu">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <User className="text-primary-foreground" size={16} />
            </div>
            <span className="font-medium">Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
