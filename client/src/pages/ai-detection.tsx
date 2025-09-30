import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import CameraSettingsModal from '@/components/camera-settings-modal';
import AccountLoginModal from '@/components/account-login-modal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Target, TrendingUp, Eye } from 'lucide-react';
import { type Detection, type Camera } from '@shared/schema';
import { format } from 'date-fns';

export default function AIDetection() {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '4x4'>('2x2');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const { data: detections = [] } = useQuery<Detection[]>({
    queryKey: ['/api/detections'],
  });

  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ['/api/cameras'],
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        <Header 
          layout={layout} 
          onLayoutChange={setLayout}
          onAddCamera={() => setIsModalOpen(true)}
          onOpenAccountSettings={() => setIsAccountModalOpen(true)}
        />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">AI Detection</h1>
            <p className="text-muted-foreground">Monitor AI-powered object and motion detection</p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Detections</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{detections.length}</div>
                <p className="text-xs text-muted-foreground">All time detections</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Cameras</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{cameras.filter(c => c.aiDetectionEnabled).length}</div>
                <p className="text-xs text-muted-foreground">with AI enabled</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Confidence Rate</CardTitle>
                <Brain className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">94.2%</div>
                <p className="text-xs text-muted-foreground">average accuracy</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today's Activity</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {detections.filter(d => {
                    const today = new Date();
                    const detectionDate = d.createdAt ? new Date(d.createdAt) : null;
                    return detectionDate && detectionDate.toDateString() === today.toDateString();
                  }).length}
                </div>
                <p className="text-xs text-muted-foreground">detections today</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Detections</CardTitle>
              <CardDescription>Latest AI detection events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {detections.slice(0, 10).map((detection) => {
                  const camera = cameras.find(c => c.id === detection.cameraId);
                  return (
                    <div key={detection.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center">
                          <Brain className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{detection.type}</p>
                          <p className="text-sm text-muted-foreground">
                            {camera?.name || 'Unknown Camera'} • {detection.createdAt ? format(new Date(detection.createdAt), 'MMM d, h:mm a') : 'Unknown time'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {Math.round(detection.confidence * 100)}% confidence
                      </div>
                    </div>
                  );
                })}
                {detections.length === 0 && (
                  <div className="text-muted-foreground text-center py-8">
                    No detections yet. AI will start detecting once cameras are active.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      <CameraSettingsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />

      <AccountLoginModal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAccountModalOpen(false)} 
      />
    </div>
  );
}
