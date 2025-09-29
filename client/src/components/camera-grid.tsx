import { type Camera } from '@shared/schema';
import CameraFeed from './camera-feed';
import { cn } from '@/lib/utils';

interface CameraGridProps {
  cameras: Camera[];
  layout: '2x2' | '3x3' | '4x4';
}

export default function CameraGrid({ cameras, layout }: CameraGridProps) {
  const gridClasses = {
    '2x2': 'grid-cols-2',
    '3x3': 'grid-cols-3',
    '4x4': 'grid-cols-4',
  };

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
