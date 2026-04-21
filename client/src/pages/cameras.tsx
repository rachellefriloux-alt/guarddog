import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import CameraGrid from '@/components/camera-grid';
import CameraAddWizard from '@/components/camera-add-wizard';
import AccountLoginModal from '@/components/account-login-modal';
import { type Camera } from '@shared/schema';

export default function Cameras() {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '4x4'>('3x3');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

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
            <h1 className="text-3xl font-bold">Cameras</h1>
            <p className="text-muted-foreground">Manage and monitor all your cameras</p>
          </div>
          
          <CameraGrid cameras={cameras} layout={layout} onAddCamera={() => setIsModalOpen(true)} />
        </main>
      </div>

      <CameraAddWizard
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
