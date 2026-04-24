import { Shield, Grid, Video, PlayCircle, Cloud, Brain, Bell, Settings, Stethoscope, Layers, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  
  const menuItems = [
    { icon: Grid, label: 'Dashboard', path: '/', count: null },
    { icon: Video, label: 'Cameras', path: '/cameras', count: null },
    { icon: PlayCircle, label: 'Recordings', path: '/recordings', count: null },
    { icon: Cloud, label: 'Cloud Storage', path: '/cloud-storage', count: null },
    { icon: Brain, label: 'AI Detection', path: '/ai-detection', count: null },
    { icon: Layers, label: 'Parity Dashboard', path: '/parity-dashboard', count: null },
    { icon: Bell, label: 'Alerts', path: '/alerts', count: null },
    { icon: Clock, label: 'Timeline', path: '/events', count: null },
    { icon: Settings, label: 'Settings', path: '/settings', count: null },
    { icon: Stethoscope, label: 'Diagnostics', path: '/diagnostics', count: null },
  ];

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo and Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Shield className="text-primary-foreground" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans">SecureWatch</h1>
            <p className="text-sm text-muted-foreground">IP Camera Hub</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          return (
            <button
              key={item.label}
              onClick={() => setLocation(item.path)}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-left",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon size={20} />
              <span className="flex-1">{item.label}</span>
              {item.count && (
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  item.label === 'Alerts' 
                    ? "bg-alert text-white" 
                    : "bg-secondary text-secondary-foreground"
                )}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Status Panel */}
      <div className="p-4 border-t border-border">
        <div className="bg-muted rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">System Status</span>
            <div className="w-2 h-2 bg-success rounded-full status-indicator" data-testid="status-indicator"></div>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Active Cameras</span>
              <span className="text-success font-medium" data-testid="status-active-cameras">6/6</span>
            </div>
            <div className="flex justify-between">
              <span>Recording</span>
              <span className="text-success font-medium" data-testid="status-recording">ON</span>
            </div>
            <div className="flex justify-between">
              <span>Cloud Sync</span>
              <span className="text-success font-medium" data-testid="status-cloud-sync">OK</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
