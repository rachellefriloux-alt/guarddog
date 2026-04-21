import { type Camera } from '@shared/schema';
import CameraFeed from './camera-feed';
import { EmptyState } from './empty-state';
import { Video } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CameraGridProps {
  cameras: Camera[];
  layout: '2x2' | '3x3' | '4x4';
  onAddCamera?: () => void;
}

export default function CameraGrid({ cameras, layout, onAddCamera }: CameraGridProps) {
  const gridClasses = {
    '2x2': 'grid-cols-1 md:grid-cols-2',
    '3x3': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    '4x4': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  if (cameras.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No cameras yet"
        description="Connect your first camera to start streaming and recording. We can scan your network for ONVIF devices automatically."
        action={onAddCamera ? { label: 'Add a camera', onClick: onAddCamera } : undefined}
      />
    );
  }

  return (
    <div 
      className={cn('grid gap-6 mb-6', gridClasses[layout])}
      data-testid="camera-grid"
    >
      {cameras.map((camera) => (
        <CameraFeed 
          key={camera.id} 
          camera={camera}
          data-testid={`camera-feed-${camera.id}`}
        />
      ))}
    </div>
  );
}
