import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import CameraSettingsModal from '@/components/camera-settings-modal';
import AccountLoginModal from '@/components/account-login-modal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Video, Calendar, Clock, Download, Play, Share2 } from 'lucide-react';
import { type Recording } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

export default function Recordings() {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '4x4'>('2x2');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const { toast } = useToast();

  const { data: recordings = [] } = useQuery<Recording[]>({
    queryKey: ['/api/recordings'],
  });

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalRecordings = recordings.length;
  const totalSize = recordings.reduce((acc, rec) => acc + (rec.fileSize || 0), 0);
  const recentCount = recordings.filter(rec =>
    rec.createdAt && new Date(rec.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000
  ).length;

  const handleDownload = async (cameraId: string, filename: string) => {
    try {
      const response = await fetch(`/api/recordings/${cameraId}/${filename}/download`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  /**
   * Mint a share token for a recording so users can hand a single, short-lived
   * URL to a neighbor / officer without exposing the rest of their library.
   * The link is copied straight to the clipboard.
   */
  const handleShare = async (recordingId: string) => {
    try {
      const res = await fetch(`/api/recordings/${recordingId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlDays: 7 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url, expiresAt } = await res.json();
      const fullUrl = `${window.location.origin}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      toast({
        title: 'Share link copied',
        description: `Expires ${new Date(expiresAt).toLocaleString()}.`,
      });
    } catch (err) {
      toast({
        title: 'Could not generate share link',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

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
            <h1 className="text-3xl font-bold">Recordings</h1>
            <p className="text-muted-foreground">View and manage your recorded footage</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Recordings</CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalRecordings}</div>
                <p className="text-xs text-muted-foreground">across all cameras</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatFileSize(totalSize)}</div>
                <p className="text-xs text-muted-foreground">total video storage</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{recentCount}</div>
                <p className="text-xs text-muted-foreground">recordings in last 24h</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Recordings</CardTitle>
              <CardDescription>Your most recent recorded footage</CardDescription>
            </CardHeader>
            <CardContent>
              {recordings.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">
                  <Video className="mx-auto h-12 w-12 mb-4 text-muted-foreground/50" />
                  <p>No recordings to display</p>
                  <p className="text-sm">Recordings will appear here once motion is detected</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recordings.slice(0, 10).map((recording) => (
                    <div key={recording.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-12 bg-muted rounded flex items-center justify-center">
                          <Video className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-medium">{recording.filename || `Recording ${recording.id}`}</h3>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span>Camera {recording.cameraId}</span>
                            {recording.duration && <span>{formatDuration(recording.duration)}</span>}
                            {recording.fileSize && <span>{formatFileSize(recording.fileSize)}</span>}
                            <span>{recording.createdAt ? new Date(recording.createdAt).toLocaleString() : 'Unknown'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="default">
                          Recording
                        </Badge>
                        <Button size="sm" variant="outline">
                          <Play className="h-4 w-4 mr-2" />
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(recording.cameraId, recording.filename || `recording-${recording.id}.mp4`)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleShare(recording.id)}
                          data-testid={`button-share-${recording.id}`}
                        >
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
