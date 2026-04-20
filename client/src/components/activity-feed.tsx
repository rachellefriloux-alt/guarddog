import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Detection, type Camera } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';

interface ActivityFeedProps {
  detections: Detection[];
  cameras: Camera[];
}

export default function ActivityFeed({ detections, cameras }: ActivityFeedProps) {
  const getCameraName = (cameraId: string) => {
    const camera = cameras.find(c => c.id === cameraId);
    return camera?.name || 'Unknown Camera';
  };

  const getDetectionIcon = (type: string) => {
    switch (type) {
      case 'person': return '🚶';
      case 'pet': return '🐱';
      case 'vehicle': return '🚗';
      default: return '👁️';
    }
  };

  const getDetectionColor = (type: string) => {
    switch (type) {
      case 'person': return 'bg-alert';
      case 'pet': return 'bg-primary';
      case 'vehicle': return 'bg-success';
      default: return 'bg-muted';
    }
  };

  return (
    <Card className="col-span-2" data-testid="activity-feed">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <Button variant="ghost" size="sm" data-testid="button-view-all-activity">
            View All
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {detections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="no-activity">
            <p>No recent activity detected</p>
          </div>
        ) : (
          <div className="space-y-4">
            {detections.slice(0, 5).map((detection) => (
              <div 
                key={detection.id} 
                className="flex items-start space-x-4"
                data-testid={`detection-${detection.id}`}
              >
                <div className={`w-2 h-2 rounded-full mt-2 ${getDetectionColor(detection.type)} recording-dot`} />
                
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center space-x-2">
                      <span>{getDetectionIcon(detection.type)}</span>
                      <span data-testid={`detection-description-${detection.id}`}>
                        {detection.description}
                      </span>
                    </h4>
                    <span className="text-sm text-muted-foreground" data-testid={`detection-time-${detection.id}`}>
                      {detection.createdAt ? formatDistanceToNow(new Date(detection.createdAt), { addSuffix: true }) : 'Unknown time'}
                    </span>
                  </div>
                  
                  <p className="text-sm text-muted-foreground" data-testid={`detection-camera-${detection.id}`}>
                    {getCameraName(detection.cameraId)} • Confidence: {Math.round(detection.confidence * 100)}%
                  </p>
                  
                  {detection.metadata?.classification && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {detection.metadata.classification}
                    </Badge>
                  )}
                  
                  <div className="flex space-x-2 mt-2">
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      className="text-xs"
                      data-testid={`button-view-recording-${detection.id}`}
                    >
                      View Recording
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs"
                      data-testid={`button-download-${detection.id}`}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
