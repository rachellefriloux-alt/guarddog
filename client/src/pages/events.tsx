import { useState } from 'react';
import { useLocation } from 'wouter';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import CameraSettingsModal from '@/components/camera-settings-modal';
import AccountLoginModal from '@/components/account-login-modal';
import EventTimeline from '@/components/EventTimeline';

/**
 * Investigations timeline page. Click any event card to open the media
 * viewer with snapshot, clip playback, and AI bounding-box overlay.
 */
export default function EventsPage() {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '4x4'>('2x2');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [, navigate] = useLocation();

  // Optional `?eventId=...` deep-link, e.g. when arriving from a push
  // notification handled by the desktop shell.
  const initialEventId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('eventId') ?? undefined
      : undefined;

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
            <h1 className="text-3xl font-bold">Event Timeline</h1>
            <p className="text-muted-foreground">
              Scroll back through detections, review snapshots and clips, and jump into the live
              feed for any camera.
            </p>
          </div>

          <div className="max-w-4xl">
            <EventTimeline
              initialEventId={initialEventId}
              onOpenLiveView={(cameraId) => navigate(`/cameras?cameraId=${encodeURIComponent(cameraId)}`)}
            />
          </div>
        </main>
      </div>

      <CameraSettingsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <AccountLoginModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} />
    </div>
  );
}
