import { Video, Brain, Cloud, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { type SystemStats } from '@shared/schema';

interface StatsGridProps {
  stats: SystemStats;
}

export default function StatsGrid({ stats }: StatsGridProps) {
  const statItems = [
    {
      label: 'Active Cameras',
      value: stats.activeCameras,
      icon: Video,
      color: 'text-success',
      bgColor: 'bg-success/10',
      testId: 'stat-active-cameras'
    },
    {
      label: 'Detections Today',
      value: stats.detectionsToday,
      icon: Brain,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
      testId: 'stat-detections-today'
    },
    {
      label: 'Cloud Storage',
      value: `${stats.cloudStorageUsed.toFixed(1)}GB`,
      icon: Cloud,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      testId: 'stat-cloud-storage'
    },
    {
      label: 'Alerts',
      value: stats.alertCount,
      icon: AlertTriangle,
      color: 'text-alert',
      bgColor: 'bg-alert/10',
      testId: 'stat-alerts'
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-6 mb-6" data-testid="stats-grid">
      {statItems.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} data-testid={item.testId}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">{item.label}</p>
                  <p className="text-2xl font-bold" data-testid={`${item.testId}-value`}>
                    {item.value}
                  </p>
                </div>
                <div className={`w-12 h-12 ${item.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`${item.color} text-xl`} size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
