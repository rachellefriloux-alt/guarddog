import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle, Cloud, Camera, HardDrive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AccountLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConnectionStatus {
  googleDrive: 'disconnected' | 'connecting' | 'connected' | 'error';
  ring: 'disconnected' | 'connecting' | 'connected' | 'error';
  eseeCloud: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export default function AccountLoginModal({ isOpen, onClose }: AccountLoginModalProps) {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('google-drive');
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    googleDrive: 'disconnected',
    ring: 'disconnected',
    eseeCloud: 'disconnected'
  });

  // Google Drive states
  const [googleDriveUsage, setGoogleDriveUsage] = useState<{ used: number; total: number } | null>(null);

  // Ring states
  const [ringCredentials, setRingCredentials] = useState({
    email: '',
    password: '',
    refreshToken: ''
  });
  const [ringTwoFactor, setRingTwoFactor] = useState({
    pendingAuthId: '',
    code: '',
    message: ''
  });
  const [ringAccountEmail, setRingAccountEmail] = useState<string | null>(null);
  const [useRingRefreshToken, setUseRingRefreshToken] = useState(false);

  // ESEE Cloud states
  const [eseeCredentials, setEseeCredentials] = useState({
    username: '',
    password: '',
    serverUrl: 'https://cloud.eseecloud.com'
  });

  useEffect(() => {
    if (isOpen) {
      checkConnectionStatuses();
    }
  }, [isOpen]);

  const checkConnectionStatuses = async () => {
    try {
      // Check Google Drive status
      try {
        const usage = await apiRequest('GET', '/api/google-drive/storage');
        const data = await usage.json();
        setGoogleDriveUsage(data);
        setConnectionStatus(prev => ({ ...prev, googleDrive: 'connected' }));
      } catch {
        setConnectionStatus(prev => ({ ...prev, googleDrive: 'disconnected' }));
      }

      // Check Ring status
      try {
        const response = await apiRequest('GET', '/api/ring/status');
        const data = await response.json();
        if (data?.connected) {
          setRingAccountEmail(data.email || null);
          setConnectionStatus(prev => ({ ...prev, ring: 'connected' }));
        } else {
          setRingAccountEmail(null);
          setConnectionStatus(prev => ({ ...prev, ring: 'disconnected' }));
        }
      } catch {
        setRingAccountEmail(null);
        setConnectionStatus(prev => ({ ...prev, ring: 'disconnected' }));
      }

      // Check ESEE Cloud status
      try {
        await apiRequest('GET', '/api/esee-cloud/status');
        setConnectionStatus(prev => ({ ...prev, eseeCloud: 'connected' }));
      } catch {
        setConnectionStatus(prev => ({ ...prev, eseeCloud: 'disconnected' }));
      }
    } catch (error) {
      console.error('Error checking connection statuses:', error);
    }
  };

  const handleGoogleDriveLogin = async () => {
    try {
      setLoading(true);
      setConnectionStatus(prev => ({ ...prev, googleDrive: 'connecting' }));

      const response = await apiRequest('GET', '/api/google-drive/auth-url');
      const data = await response.json();

      if (data.authUrl) {
        // Open Google auth in popup
        const popup = window.open(
          data.authUrl,
          'google-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        // Listen for popup completion
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            // Check if authentication was successful
            setTimeout(checkConnectionStatuses, 1000);
          }
        }, 1000);
      }
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, googleDrive: 'error' }));
      toast({
        title: "Connection Failed",
        description: "Failed to initiate Google Drive authentication",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRingLogin = async () => {
    try {
      setLoading(true);
      setConnectionStatus(prev => ({ ...prev, ring: 'connecting' }));

      const payload = useRingRefreshToken
        ? { refreshToken: ringCredentials.refreshToken.trim() }
        : {
          email: ringCredentials.email.trim(),
          password: ringCredentials.password
        };

      const response = await apiRequest('POST', '/api/ring/auth', payload);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to connect to Ring');
      }

      if (data?.requiresTwoFactor && data.pendingAuthId) {
        setRingTwoFactor({
          pendingAuthId: data.pendingAuthId,
          code: '',
          message: data.message || 'Enter the 2FA code sent to your device'
        });
        setConnectionStatus(prev => ({ ...prev, ring: 'disconnected' }));
        toast({
          title: "Two-Factor Required",
          description: "Enter the 2FA code from Ring to finish connecting",
        });
        return;
      }

      setConnectionStatus(prev => ({ ...prev, ring: 'connected' }));
      setRingAccountEmail(data?.email || null);
      toast({
        title: "Ring Connected",
        description: "Successfully connected to Ring account",
      });
      setRingCredentials({ email: '', password: '', refreshToken: '' });
      setRingTwoFactor({ pendingAuthId: '', code: '', message: '' });
      checkConnectionStatuses();
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, ring: 'error' }));
      toast({
        title: "Ring Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to Ring",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRingTwoFactorSubmit = async () => {
    try {
      setLoading(true);
      setConnectionStatus(prev => ({ ...prev, ring: 'connecting' }));

      const response = await apiRequest('POST', '/api/ring/auth/verify', {
        pendingAuthId: ringTwoFactor.pendingAuthId,
        twoFactorCode: ringTwoFactor.code.trim()
      });
      const data = await response.json();

      if (!response.ok) {
        if (data?.retryable) {
          throw new Error(data?.message || 'Invalid 2FA code. Please try again.');
        }

        setRingTwoFactor({ pendingAuthId: '', code: '', message: '' });
        throw new Error(data?.message || 'Failed to verify 2FA code. Please restart the login process.');
      }

      setConnectionStatus(prev => ({ ...prev, ring: 'connected' }));
      setRingAccountEmail(data?.email || null);
      toast({
        title: "Ring Connected",
        description: "Two-factor authentication successful",
      });
      setRingCredentials({ email: '', password: '', refreshToken: '' });
      setRingTwoFactor({ pendingAuthId: '', code: '', message: '' });
      checkConnectionStatuses();
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, ring: 'error' }));
      toast({
        title: "Ring 2FA Failed",
        description: error instanceof Error ? error.message : "Failed to verify Ring 2FA code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEseeCloudLogin = async () => {
    try {
      setLoading(true);
      setConnectionStatus(prev => ({ ...prev, eseeCloud: 'connecting' }));

      const response = await apiRequest('POST', '/api/esee-cloud/auth', eseeCredentials);

      if (response.ok) {
        setConnectionStatus(prev => ({ ...prev, eseeCloud: 'connected' }));
        toast({
          title: "ESEE Cloud Connected",
          description: "Successfully connected to ESEE Cloud account",
        });
        setEseeCredentials({ username: '', password: '', serverUrl: 'https://cloud.eseecloud.com' });
      } else {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, eseeCloud: 'error' }));
      toast({
        title: "ESEE Cloud Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to ESEE Cloud",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectService = async (service: keyof ConnectionStatus) => {
    try {
      setLoading(true);

      const endpoints = {
        googleDrive: '/api/google-drive/disconnect',
        ring: '/api/ring/disconnect',
        eseeCloud: '/api/esee-cloud/disconnect'
      };

      await apiRequest('POST', endpoints[service]);
      setConnectionStatus(prev => ({ ...prev, [service]: 'disconnected' }));

      toast({
        title: "Disconnected",
        description: `Successfully disconnected from ${service.replace(/([A-Z])/g, ' $1').trim()}`,
      });

      if (service === 'googleDrive') {
        setGoogleDriveUsage(null);
      } else if (service === 'ring') {
        setRingAccountEmail(null);
        setRingCredentials({ email: '', password: '', refreshToken: '' });
        setRingTwoFactor({ pendingAuthId: '', code: '', message: '' });
        setUseRingRefreshToken(false);
      }
    } catch (error) {
      toast({
        title: "Disconnect Failed",
        description: `Failed to disconnect from ${service}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: ConnectionStatus[keyof ConnectionStatus]) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-success text-white"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>;
      case 'connecting':
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Connecting...</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">Disconnected</Badge>;
    }
  };

  const userInitials = (user?.name || user?.email || 'U')
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" />
            Account Connections
          </DialogTitle>
        </DialogHeader>

        {user && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {user.picture ? (
                  <AvatarImage src={user.picture} alt={user.name ?? user.email} />
                ) : (
                  <AvatarFallback>{userInitials}</AvatarFallback>
                )}
              </Avatar>
              <div>
                <p className="font-semibold leading-tight">{user.name ?? user.email}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} disabled={loading}>
              Sign out
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="google-drive" className="flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              Google Drive
              {getStatusBadge(connectionStatus.googleDrive)}
            </TabsTrigger>
            <TabsTrigger value="ring" className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Ring
              {getStatusBadge(connectionStatus.ring)}
            </TabsTrigger>
            <TabsTrigger value="esee-cloud" className="flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              ESEE Cloud
              {getStatusBadge(connectionStatus.eseeCloud)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="google-drive" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-guardian-blue" />
                  Google Drive Storage
                </CardTitle>
                <CardDescription>
                  Connect your Google Drive for automatic video and snapshot backup (15GB free)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {connectionStatus.googleDrive === 'connected' && googleDriveUsage ? (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Storage Used</span>
                        <span>{Math.round(googleDriveUsage.used / (1024 * 1024 * 1024) * 100) / 100} GB / {Math.round(googleDriveUsage.total / (1024 * 1024 * 1024))} GB</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-guardian-blue h-2 rounded-full"
                          style={{ width: `${(googleDriveUsage.used / googleDriveUsage.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleDisconnectService('googleDrive')}
                      variant="outline"
                      disabled={loading}
                    >
                      Disconnect Google Drive
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Connect your Google Drive account to automatically backup recordings and snapshots to the cloud.
                    </p>
                    <Button
                      onClick={handleGoogleDriveLogin}
                      disabled={loading || connectionStatus.googleDrive === 'connecting'}
                      className="w-full"
                    >
                      {connectionStatus.googleDrive === 'connecting' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <HardDrive className="w-4 h-4 mr-2" />
                          Connect Google Drive
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ring" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-guardian-blue" />
                  Ring Account
                </CardTitle>
                <CardDescription>
                  Connect your Ring account to access doorbell cameras and devices
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {connectionStatus.ring === 'connected' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-success">✓ Ring account is connected{ringAccountEmail ? ` (${ringAccountEmail})` : ''}</p>
                    <Button
                      onClick={() => handleDisconnectService('ring')}
                      variant="outline"
                      disabled={loading}
                    >
                      Disconnect Ring Account
                    </Button>
                  </div>
                ) : ringTwoFactor.pendingAuthId ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                      <p className="font-medium text-blue-800 mb-2">� Two-Factor Authentication Required</p>
                      <p className="text-blue-700">{ringTwoFactor.message || 'Enter the 2FA code from your Ring app to continue.'}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ring-two-factor">2FA Code</Label>
                      <Input
                        id="ring-two-factor"
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter your 2FA code..."
                        value={ringTwoFactor.code}
                        onChange={(e) => setRingTwoFactor(prev => ({ ...prev, code: e.target.value }))}
                        className="font-mono"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={handleRingTwoFactorSubmit}
                        disabled={loading || !ringTwoFactor.code}
                        className="flex-1"
                      >
                        {connectionStatus.ring === 'connecting' ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 mr-2" />
                            Verify 2FA Code
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRingTwoFactor({ pendingAuthId: '', code: '', message: '' });
                          setConnectionStatus(prev => ({ ...prev, ring: 'disconnected' }));
                        }}
                        disabled={loading}
                      >
                        Start Over
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!useRingRefreshToken ? (
                      <>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                          <p className="font-medium text-blue-800 mb-2">🔐 Secure Sign In</p>
                          <p className="text-blue-700">Sign in with your Ring email and password. If your account has 2FA enabled, we'll prompt you for the code automatically.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ring-email">Ring Email</Label>
                          <Input
                            id="ring-email"
                            type="email"
                            value={ringCredentials.email}
                            onChange={(e) => setRingCredentials(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="name@example.com"
                            autoComplete="email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ring-password">Ring Password</Label>
                          <Input
                            id="ring-password"
                            type="password"
                            value={ringCredentials.password}
                            onChange={(e) => setRingCredentials(prev => ({ ...prev, password: e.target.value }))}
                            placeholder="Enter your Ring password"
                            autoComplete="current-password"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                          <p className="font-medium text-blue-800 mb-2">🔑 Use an Existing Refresh Token</p>
                          <p className="text-blue-700">Paste a refresh token generated with the official Ring CLI if you prefer to authenticate manually.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ring-refresh-token">Ring Refresh Token</Label>
                          <Input
                            id="ring-refresh-token"
                            type="text"
                            placeholder="Paste your Ring refresh token here..."
                            value={ringCredentials.refreshToken}
                            onChange={(e) => setRingCredentials(prev => ({ ...prev, refreshToken: e.target.value }))}
                            className="font-mono text-xs"
                          />
                        </div>
                      </>
                    )}
                    <Button
                      onClick={handleRingLogin}
                      disabled={
                        loading ||
                        connectionStatus.ring === 'connecting' ||
                        (useRingRefreshToken
                          ? !ringCredentials.refreshToken
                          : !ringCredentials.email || !ringCredentials.password)
                      }
                      className="w-full"
                    >
                      {connectionStatus.ring === 'connecting' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4 mr-2" />
                          Connect Ring Account
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => {
                        setUseRingRefreshToken(prev => !prev);
                        setRingCredentials(prev => ({
                          email: prev.email,
                          password: '',
                          refreshToken: ''
                        }));
                      }}
                      disabled={loading}
                    >
                      {useRingRefreshToken ? 'Sign in with email and password instead' : 'Have a refresh token? Paste it instead'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="esee-cloud" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-guardian-blue" />
                  ESEE Cloud
                </CardTitle>
                <CardDescription>
                  Connect to ESEE Cloud service to access your cloud-based cameras
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {connectionStatus.eseeCloud === 'connected' ? (
                  <div className="space-y-3">
                    <p className="text-sm text-success">✓ ESEE Cloud account is connected and ready</p>
                    <Button
                      onClick={() => handleDisconnectService('eseeCloud')}
                      variant="outline"
                      disabled={loading}
                    >
                      Disconnect ESEE Cloud
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="esee-username">Username</Label>
                      <Input
                        id="esee-username"
                        type="text"
                        placeholder="Your ESEE username"
                        value={eseeCredentials.username}
                        onChange={(e) => setEseeCredentials(prev => ({ ...prev, username: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="esee-password">Password</Label>
                      <Input
                        id="esee-password"
                        type="password"
                        placeholder="Your ESEE password"
                        value={eseeCredentials.password}
                        onChange={(e) => setEseeCredentials(prev => ({ ...prev, password: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="esee-server">Server URL</Label>
                      <Input
                        id="esee-server"
                        type="url"
                        placeholder="https://cloud.eseecloud.com"
                        value={eseeCredentials.serverUrl}
                        onChange={(e) => setEseeCredentials(prev => ({ ...prev, serverUrl: e.target.value }))}
                      />
                    </div>
                    <Button
                      onClick={handleEseeCloudLogin}
                      disabled={loading || !eseeCredentials.username || !eseeCredentials.password}
                      className="w-full"
                    >
                      {connectionStatus.eseeCloud === 'connecting' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Cloud className="w-4 h-4 mr-2" />
                          Connect ESEE Cloud
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}