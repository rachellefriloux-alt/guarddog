import { RingApi } from 'ring-client-api';
import fs from 'fs-extra';
import path from 'path';

export class RingAuthService {
  private ringApi: RingApi | null = null;
  private isAuthenticated = false;
  private credentials: { email: string; password: string; refreshToken?: string; twoFactorAuthCode?: string } | null = null;
  private credentialsPath = path.join(process.cwd(), 'storage', 'ring-credentials.json');

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
      if (!this.credentials?.refreshToken) return false;

      this.ringApi = new RingApi({
        refreshToken: this.credentials.refreshToken,
        debug: process.env.NODE_ENV === 'development'
      });

      // Test the connection
      await this.ringApi.getProfile();
      this.isAuthenticated = true;
      console.log('Ring API initialized with stored refresh token');
      return true;
    } catch (error) {
      console.error('Error initializing Ring API with refresh token:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  async authenticate(email: string, password: string, twoFactorAuthCode?: string): Promise<{ success: boolean; error?: string; requiresTwoFactor?: boolean }> {
    try {
      this.credentials = { email, password, twoFactorAuthCode };

      const ringApiOptions: any = {
        email,
        password,
        debug: process.env.NODE_ENV === 'development'
      };

      if (twoFactorAuthCode) {
        ringApiOptions.twoFactorAuthCode = twoFactorAuthCode;
      }

      this.ringApi = new RingApi(ringApiOptions);

      // Test authentication by getting profile
      const profile = await this.ringApi.getProfile();
      
      // Get refresh token for future use
      if (this.ringApi.restClient.refreshToken) {
        this.credentials.refreshToken = this.ringApi.restClient.refreshToken;
        await this.saveCredentials();
      }

      this.isAuthenticated = true;
      console.log(`Ring authentication successful for user: ${profile.profile.email}`);
      
      return { success: true };
    } catch (error: any) {
      console.error('Ring authentication error:', error);
      
      // Check if it's a two-factor authentication error
      if (error.message?.includes('two factor') || error.message?.includes('2fa')) {
        return { 
          success: false, 
          requiresTwoFactor: true,
          error: 'Two-factor authentication required. Please provide the code from your authenticator app.'
        };
      }

      return { 
        success: false, 
        error: error.message || 'Authentication failed. Please check your credentials.'
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