import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import ActivityFeed from '@/components/activity-feed';
import CameraSettingsModal from '@/components/camera-settings-modal';
import AccountLoginModal from '@/components/account-login-modal';
import { type Detection, type Camera } from '@shared/schema';

export default function Alerts() {
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
            <h1 className="text-3xl font-bold">Alerts</h1>
            <p className="text-muted-foreground">Monitor and manage security alerts</p>
          </div>
          
          <div className="max-w-4xl">
            <ActivityFeed detections={detections} cameras={cameras} />
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
