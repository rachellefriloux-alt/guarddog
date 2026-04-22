import { useState } from 'react';
import Sidebar from '@/components/sidebar';
import Header from '@/components/header';
import CameraSettingsModal from '@/components/camera-settings-modal';
import AccountLoginModal from '@/components/account-login-modal';
import { NotificationsPanel, AuditLogPanel, AlertPipelinePanel } from '@/components/notifications-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bell, Shield, Database, Wifi } from 'lucide-react';

export default function Settings() {
  const [layout, setLayout] = useState<'2x2' | '3x3' | '4x4'>('2x2');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

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
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Configure your GuardDog system</p>
          </div>
          
          <div className="space-y-6 max-w-4xl">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  <CardTitle>Notifications</CardTitle>
                </div>
                <CardDescription>Manage how you receive alerts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="motion-alerts" className="flex flex-col gap-1">
                    <span>Motion Detection Alerts</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Receive notifications when motion is detected
                    </span>
                  </Label>
                  <Switch id="motion-alerts" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-alerts" className="flex flex-col gap-1">
                    <span>AI Detection Alerts</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Get notified about AI-identified objects
                    </span>
                  </Label>
                  <Switch id="ai-alerts" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="email-alerts" className="flex flex-col gap-1">
                    <span>Email Notifications</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Send alerts to your email
                    </span>
                  </Label>
                  <Switch id="email-alerts" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle>Security</CardTitle>
                </div>
                <CardDescription>Security and privacy settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="encryption" className="flex flex-col gap-1">
                    <span>Encrypt Recordings</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Encrypt all video recordings
                    </span>
                  </Label>
                  <Switch id="encryption" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-delete" className="flex flex-col gap-1">
                    <span>Auto-delete Old Recordings</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Automatically remove recordings older than 30 days
                    </span>
                  </Label>
                  <Switch id="auto-delete" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  <CardTitle>Storage</CardTitle>
                </div>
                <CardDescription>Manage storage and retention</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="retention-days">Retention Period (days)</Label>
                  <Input id="retention-days" type="number" defaultValue="30" />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="cloud-backup" className="flex flex-col gap-1">
                    <span>Cloud Backup</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Automatically backup to cloud storage
                    </span>
                  </Label>
                  <Switch id="cloud-backup" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Wifi className="h-5 w-5" />
                  <CardTitle>Network</CardTitle>
                </div>
                <CardDescription>Network and connectivity settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stream-quality">Stream Quality</Label>
                  <select 
                    id="stream-quality"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option>High (1080p)</option>
                    <option>Medium (720p)</option>
                    <option>Low (480p)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="adaptive-streaming" className="flex flex-col gap-1">
                    <span>Adaptive Streaming</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Adjust quality based on network conditions
                    </span>
                  </Label>
                  <Switch id="adaptive-streaming" defaultChecked />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button variant="outline">Reset to Defaults</Button>
              <Button>Save Changes</Button>
            </div>

            <NotificationsPanel />
            <AlertPipelinePanel />
            <AuditLogPanel />
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
