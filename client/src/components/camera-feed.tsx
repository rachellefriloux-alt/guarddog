import { useState } from 'react';
import { Play, Maximize, Download, Settings, Wifi, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Camera } from '@shared/schema';
import { cn } from '@/lib/utils';

interface CameraFeedProps {
  camera: Camera;
}

export default function CameraFeed({ camera }: CameraFeedProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Simulate camera feed images based on location
  const getSimulatedFeedImage = (location: string) => {
    const imageMap = {
      front_door: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=450",
      backyard: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=450",
      driveway: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=450",
      side_gate: "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=450",
    };
    return imageMap[location as keyof typeof imageMap] || imageMap.front_door;
  };

  // Simulate recent detection for demonstration
  const getRecentDetection = () => {
    const detectionTypes = {
      front_door: { type: 'person', label: 'Person Detected', icon: '🚶', color: 'bg-secondary' },
      backyard: { type: 'pet', label: 'Pet Detected', icon: '🐱', color: 'bg-primary' },
      driveway: { type: 'vehicle', label: 'Vehicle Detected', icon: '🚗', color: 'bg-alert' },
      side_gate: { type: 'none', label: 'No Motion', icon: '🌙', color: 'bg-muted' },
    };
    return detectionTypes[camera.location as keyof typeof detectionTypes] || detectionTypes.front_door;
  };

  const detection = getRecentDetection();
  const wifiStrengthColor = (camera.wifiStrength ?? 0) > 90 ? 'text-success' : (camera.wifiStrength ?? 0) > 70 ? 'text-yellow-500' : 'text-alert';

  return (
    <Card 
      className="overflow-hidden group hover:shadow-lg transition-shadow"
      data-testid={`camera-card-${camera.id}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative">
        <div className="video-feed aspect-video relative">
          <img 
            src={getSimulatedFeedImage(camera.location)}
            alt={`${camera.name} camera feed`}
            className="w-full h-full object-cover"
            data-testid={`camera-image-${camera.id}`}
          />
          
          {/* Recording indicator */}
          <div className="absolute top-4 left-4 flex items-center space-x-2">
            <div className={cn(
              "w-3 h-3 rounded-full",
              camera.isRecording ? "bg-alert recording-dot" : "bg-muted"
            )} />
            <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
              {camera.isRecording ? 'REC' : 'PAUSED'}
            </span>
          </div>

          {/* Live indicator */}
          <div className="absolute top-4 right-4">
            <Badge 
              className={cn(
                "text-white font-medium",
                camera.isOnline ? "bg-success" : "bg-muted"
              )}
              data-testid={`camera-status-${camera.id}`}
            >
              {camera.isOnline ? 'LIVE' : 'OFFLINE'}
            </Badge>
          </div>

          {/* Motion detection overlay */}
          <div className="absolute bottom-4 left-4">
            <div className={cn(
              "px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-2",
              detection.color,
              detection.type === 'none' ? 'text-muted-foreground' : 'text-white'
            )}>
              <span>{detection.icon}</span>
              <span>{detection.label}</span>
            </div>
          </div>

          {/* Controls overlay */}
          <div className={cn(
            "absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity",
            isHovered ? "opacity-100" : "opacity-0"
          )}>
            <div className="flex space-x-3">
              <Button 
                size="icon" 
                variant="ghost" 
                className="w-12 h-12 bg-white/20 hover:bg-white/30 text-white"
                data-testid={`button-play-${camera.id}`}
              >
                <Play size={20} />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="w-12 h-12 bg-white/20 hover:bg-white/30 text-white"
                data-testid={`button-fullscreen-${camera.id}`}
              >
                <Maximize size={20} />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="w-12 h-12 bg-white/20 hover:bg-white/30 text-white"
                data-testid={`button-download-${camera.id}`}
              >
                <Download size={20} />
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold" data-testid={`camera-name-${camera.id}`}>
            {camera.name} - {camera.type.toUpperCase()}
          </h3>
          <div className="flex items-center space-x-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              camera.isOnline ? "bg-success" : "bg-muted"
            )} />
            <span className="text-sm text-muted-foreground">
              {camera.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground mb-3" data-testid={`camera-details-${camera.id}`}>
          {camera.ipAddress} • {camera.type === 'ring' ? 'Ring' : 'ESEE'} {camera.resolution}
        </p>
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Eye size={16} className="text-muted-foreground" />
              <span data-testid={`camera-resolution-${camera.id}`}>{camera.resolution}</span>
            </span>
            <span className="flex items-center space-x-1">
              <Wifi size={16} className={wifiStrengthColor} />
              <span data-testid={`camera-wifi-${camera.id}`}>{camera.wifiStrength}%</span>
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-primary hover:text-primary/80 font-medium"
            data-testid={`button-settings-${camera.id}`}
          >
            <Settings size={16} className="mr-1" />
            Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
