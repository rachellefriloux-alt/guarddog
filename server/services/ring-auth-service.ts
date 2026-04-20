import { RingApi } from 'ring-client-api';
import { RingRestClient } from 'ring-client-api/rest-client';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

export class RingAuthService {
  private ringApi: RingApi | null = null;
  private isAuthenticated = false;
  private credentials: { email?: string; refreshToken?: string } | null = null;
  private credentialsPath = path.join(process.cwd(), 'storage', 'ring-credentials.json');
  private pendingAuthentications = new Map<string, {
    restClient: RingRestClient;
    email: string;
    createdAt: number;
    timeout: NodeJS.Timeout;
  }>();
  private readonly pendingAuthTimeoutMs = 5 * 60 * 1000;

  constructor() {
    this.loadStoredCredentials();
  }

  private async loadStoredCredentials(): Promise<void> {
    try {
      if (await fs.pathExists(this.credentialsPath)) {
        const storedCredentials = await fs.readJson(this.credentialsPath);
        if (storedCredentials.refreshToken) {
          this.credentials = storedCredentials;
          await this.initializeWithRefreshToken();
        }
      }
    } catch (error) {
      console.error('Error loading stored Ring credentials:', error);
    }
  }

  private async saveCredentials(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.credentialsPath));
      if (this.credentials) {
        await fs.writeJson(this.credentialsPath, this.credentials, { spaces: 2 });
      }
    } catch (error) {
      console.error('Error saving Ring credentials:', error);
    }
  }

  private async initializeWithRefreshToken(): Promise<boolean> {
    try {
      if (!this.credentials?.refreshToken) {
        // Check if refresh token is available in environment
        const envRefreshToken = process.env.RING_REFRESH_TOKEN;
        if (envRefreshToken) {
          const result = await this.authenticateWithRefreshToken(envRefreshToken);
          return result.success;
        }
        return false;
      }

      const result = await this.authenticateWithRefreshToken(this.credentials.refreshToken);
      return result.success;
    } catch (error) {
      console.error('Error initializing Ring API with refresh token:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  private async updateStoredRefreshToken(newRefreshToken: string): Promise<void> {
    try {
      if (this.credentials) {
        this.credentials.refreshToken = newRefreshToken;
        await this.saveCredentials();
        console.log('Ring refresh token updated and saved');
      }
    } catch (error) {
      console.error('Error updating stored refresh token:', error);
    }
  }

  async authenticate(refreshToken: string): Promise<{ success: boolean; error?: string; requiresRefreshToken?: boolean; email?: string }> {
    return await this.authenticateWithRefreshToken(refreshToken);
  }

  async authenticateWithRefreshToken(refreshToken: string): Promise<{ success: boolean; error?: string; email?: string }> {
    try {
      console.log('Attempting Ring authentication with refresh token...');
      
      this.ringApi = new RingApi({
        refreshToken,
        debug: process.env.NODE_ENV === 'development'
      });

      // Subscribe to refresh token updates (REQUIRED for push notifications)
      this.ringApi.onRefreshTokenUpdated.subscribe(
        ({ newRefreshToken, oldRefreshToken }) => {
          console.log('Ring refresh token updated');
          this.updateStoredRefreshToken(newRefreshToken);
        }
      );

      // Test the connection
      const profile = await this.ringApi.getProfile();
      
      // Save the refresh token
      this.credentials = { 
        email: profile.profile.email, 
        refreshToken 
      };
      
      await this.saveCredentials();
      this.isAuthenticated = true;
      
      console.log(`Ring authentication successful with refresh token for user: ${profile.profile.email}`);
      return { success: true, email: profile.profile.email };
    } catch (error: any) {
      console.error('Ring refresh token authentication error:', error);
      return { 
        success: false, 
        error: 'Invalid refresh token. Please generate a new one using the Ring CLI tool.'
      };
    }
  }

  private createPendingAuthentication(restClient: RingRestClient, email: string): { pendingAuthId: string; message?: string } {
    const pendingAuthId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      this.clearPendingAuthentication(pendingAuthId);
    }, this.pendingAuthTimeoutMs);

    this.pendingAuthentications.set(pendingAuthId, {
      restClient,
      email,
      createdAt: Date.now(),
      timeout
    });

    return {
      pendingAuthId,
      message: restClient.promptFor2fa
    };
  }

  private clearPendingAuthentication(pendingAuthId: string): void {
    const pending = this.pendingAuthentications.get(pendingAuthId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.restClient.clearTimeouts();
      this.pendingAuthentications.delete(pendingAuthId);
    }
  }

  async startEmailAuthentication(email: string, password: string): Promise<{
    success: boolean;
    requiresTwoFactor?: boolean;
    pendingAuthId?: string;
    message?: string;
    error?: string;
    email?: string;
  }> {
    const restClient = new RingRestClient({ email, password });

    try {
      const auth = await restClient.getCurrentAuth();
      restClient.clearTimeouts();

      const result = await this.authenticateWithRefreshToken(auth.refresh_token);
      if (result.success) {
        return {
          success: true,
          requiresTwoFactor: false,
          email: result.email,
          message: 'Ring account connected successfully'
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to authenticate with Ring'
      };
    } catch (error: any) {
      if (restClient.promptFor2fa) {
        const pending = this.createPendingAuthentication(restClient, email);
        return {
          success: true,
          requiresTwoFactor: true,
          pendingAuthId: pending.pendingAuthId,
          message: restClient.promptFor2fa
        };
      }

      restClient.clearTimeouts();
      console.error('Ring email/password authentication error:', error);
      return {
        success: false,
        error: 'Failed to authenticate with Ring. Please check your credentials and try again.'
      };
    }
  }

  async submitTwoFactorCode(pendingAuthId: string, twoFactorCode: string): Promise<{
    success: boolean;
    error?: string;
    retryable?: boolean;
    email?: string;
  }> {
    const pending = this.pendingAuthentications.get(pendingAuthId);

    if (!pending) {
      return {
        success: false,
        error: 'Authentication session has expired. Please start again.',
      };
    }

    try {
      const auth = await pending.restClient.getAuth(twoFactorCode);
      this.clearPendingAuthentication(pendingAuthId);

      const result = await this.authenticateWithRefreshToken(auth.refresh_token);
      if (result.success) {
        return {
          success: true,
          email: result.email
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to authenticate with Ring after verifying 2FA code.'
      };
    } catch (error: any) {
      console.error('Ring 2FA verification error:', error);

      if (pending.restClient.promptFor2fa) {
        return {
          success: false,
          retryable: true,
          error: 'Invalid or expired 2FA code. Please try again.'
        };
      }

      this.clearPendingAuthentication(pendingAuthId);
      return {
        success: false,
        error: 'Failed to verify 2FA code. Please restart the login process.'
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.ringApi = null;
      this.isAuthenticated = false;
      this.credentials = null;
      
      // Remove stored credentials
      if (await fs.pathExists(this.credentialsPath)) {
        await fs.remove(this.credentialsPath);
      }
      
      console.log('Ring account disconnected');
    } catch (error) {
      console.error('Error disconnecting Ring account:', error);
    }
  }

  async getDevices(): Promise<any[]> {
    if (!this.isAuthenticated || !this.ringApi) {
      throw new Error('Ring API not authenticated');
    }

    try {
      const locations = await this.ringApi.getLocations();
      const devices: any[] = [];

      for (const location of locations) {
        // Get cameras (doorbells and security cameras)
        const cameras = location.cameras;
        for (const camera of cameras) {
          devices.push({
            id: camera.id.toString(),
            name: camera.name,
            type: camera.deviceType,
            location: location.name,
            batteryLevel: camera.batteryLevel,
            isOnline: camera.data?.alerts?.connection === 'online',
            hasSnapshot: true,
            hasLiveStream: true,
            deviceInfo: {
              model: camera.model,
              firmwareVersion: (camera.data as any)?.device_health?.firmware || 'Unknown',
              wifiStrength: (camera.data as any)?.device_health?.wifi_name ? 'Connected' : 'Disconnected'
            }
          });
        }

        // Get chimes
        const chimes = location.chimes;
        for (const chime of chimes) {
          devices.push({
            id: chime.id.toString(),
            name: chime.name,
            type: 'chime',
            location: location.name,
            isOnline: chime.data?.alerts?.connection === 'online',
            hasSnapshot: false,
            hasLiveStream: false,
            deviceInfo: {
              model: chime.model,
              firmwareVersion: (chime.data as any)?.device_health?.firmware || 'Unknown',
              wifiStrength: (chime.data as any)?.device_health?.wifi_name ? 'Connected' : 'Disconnected'
            }
          });
        }
      }

      return devices;
    } catch (error) {
      console.error('Error getting Ring devices:', error);
      throw error;
    }
  }

  async getSnapshot(deviceId: string): Promise<Buffer | null> {
    if (!this.isAuthenticated || !this.ringApi) {
      throw new Error('Ring API not authenticated');
    }

    try {
      const locations = await this.ringApi.getLocations();
      
      for (const location of locations) {
        const camera = location.cameras.find(c => c.id.toString() === deviceId);
        if (camera) {
          const snapshot = await camera.getSnapshot();
          return snapshot;
        }
      }

      throw new Error('Camera not found');
    } catch (error) {
      console.error(`Error getting snapshot for device ${deviceId}:`, error);
      return null;
    }
  }

  async startLiveStream(deviceId: string): Promise<string | null> {
    if (!this.isAuthenticated || !this.ringApi) {
      throw new Error('Ring API not authenticated');
    }

    try {
      const locations = await this.ringApi.getLocations();
      
      for (const location of locations) {
        const camera = location.cameras.find(c => c.id.toString() === deviceId);
        if (camera) {
          const sipSession = await camera.streamVideo({
            output: [
              '-preset', 'veryfast',
              '-g', '25',
              '-sc_threshold', '0',
              '-f', 'hls',
              '-hls_time', '2',
              '-hls_list_size', '3',
              '-hls_flags', 'delete_segments'
            ]
          });

          // Return the HLS playlist URL
          return `/api/stream/ring/${deviceId}/playlist.m3u8`;
        }
      }

      throw new Error('Camera not found');
    } catch (error) {
      console.error(`Error starting live stream for device ${deviceId}:`, error);
      return null;
    }
  }

  async getRecordings(deviceId: string, limit: number = 10): Promise<any[]> {
    if (!this.isAuthenticated || !this.ringApi) {
      throw new Error('Ring API not authenticated');
    }

    try {
      const locations = await this.ringApi.getLocations();
      
      for (const location of locations) {
        const camera = location.cameras.find(c => c.id.toString() === deviceId);
        if (camera) {
          const eventsResponse = await camera.getEvents({ limit });
          const events = Array.isArray(eventsResponse) ? eventsResponse : [eventsResponse];
          return events.map((event: any) => ({
            id: event.ding_id_str,
            timestamp: new Date(event.created_at),
            duration: event.duration,
            kind: event.kind,
            answered: event.answered,
            recordingUrl: event.recording?.url,
            snapshotUrl: event.snapshot?.url
          }));
        }
      }

      return [];
    } catch (error) {
      console.error(`Error getting recordings for device ${deviceId}:`, error);
      return [];
    }
  }

  isConnected(): boolean {
    return this.isAuthenticated;
  }

  getConnectionStatus(): { connected: boolean; email?: string; deviceCount?: number } {
    if (!this.isAuthenticated || !this.credentials) {
      return { connected: false };
    }

    return {
      connected: true,
      email: this.credentials.email
    };
  }
}

export const ringAuthService = new RingAuthService();