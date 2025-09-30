import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/use-websocket';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import StatsGrid from '@/components/stats-grid';
import CameraGrid from '@/components/camera-grid';
import ActivityFeed from '@/components/activity-feed';
import CloudStoragePanel from '@/components/cloud-storage-panel';
import CameraSettingsModal from '@/components/camera-settings-modal';
import AccountLoginModal from '@/components/account-login-modal';
import { type Camera, type Detection, type SystemStats } from '@shared/schema';

export default function Dashboard() {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '4x4'>('2x2');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [realtimeDetections, setRealtimeDetections] = useState<Detection[]>([]);
  const [realtimeStats, setRealtimeStats] = useState<SystemStats | null>(null);

  const { lastMessage } = useWebSocket();

  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ['/api/cameras'],
  });

  const { data: detections = [] } = useQuery<Detection[]>({
    queryKey: ['/api/detections'],
  });

  const { data: stats } = useQuery<SystemStats>({
    queryKey: ['/api/system/stats'],
  });

  // Handle real-time WebSocket updates
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'detections_update':
          setRealtimeDetections(lastMessage.detections);
          break;
        case 'stats_update':
          setRealtimeStats(lastMessage.stats);
          break;
        case 'camera_added':
        case 'camera_updated':
        case 'camera_deleted':
          // Invalidate cameras query to refetch
          break;
      }
    }
  }, [lastMessage]);

  const displayDetections = realtimeDetections.length > 0 ? realtimeDetections : detections;
  const displayStats = realtimeStats || stats;

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
          {displayStats && <StatsGrid stats={displayStats} />}
          
          <CameraGrid cameras={cameras} layout={layout} />
          
          <div className="grid grid-cols-3 gap-6">
            <ActivityFeed detections={displayDetections} cameras={cameras} />
            <CloudStoragePanel />
          </div>
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
