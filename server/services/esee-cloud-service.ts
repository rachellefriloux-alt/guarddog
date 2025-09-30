import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

interface EseeCloudCredentials {
  username: string;
  password: string;
  serverUrl: string;
  authToken?: string;
  deviceId?: string;
}

interface EseeDevice {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
  channels: EseeChannel[];
  rtspUrl?: string;
}

interface EseeChannel {
  id: number;
  name: string;
  enabled: boolean;
  resolution: string;
  rtspUrl: string;
}

export class EseeCloudService {
  private credentials: EseeCloudCredentials | null = null;
  private isAuthenticated = false;
  private authToken: string | null = null;
  private credentialsPath = path.join(process.cwd(), 'storage', 'esee-credentials.json');
  private devices: EseeDevice[] = [];

  constructor() {
    this.loadStoredCredentials();
  }

  private async loadStoredCredentials(): Promise<void> {
    try {
      if (await fs.pathExists(this.credentialsPath)) {
        const storedCredentials = await fs.readJson(this.credentialsPath);
        if (storedCredentials.authToken) {
          this.credentials = storedCredentials;
          this.authToken = storedCredentials.authToken;
          await this.validateAuthentication();
        }
      }
    } catch (error) {
      console.error('Error loading stored ESEE credentials:', error);
    }
  }

  private async saveCredentials(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.credentialsPath));
      if (this.credentials) {
        await fs.writeJson(this.credentialsPath, this.credentials, { spaces: 2 });
      }
    } catch (error) {
      console.error('Error saving ESEE credentials:', error);
    }
  }

  private async validateAuthentication(): Promise<boolean> {
    try {
      if (!this.credentials?.serverUrl || !this.authToken) return false;

      const response = await axios.get(`${this.credentials.serverUrl}/api/user/info`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        this.isAuthenticated = true;
        console.log('ESEE Cloud authentication validated');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error validating ESEE authentication:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  async authenticate(username: string, password: string, serverUrl: string = 'https://cloud.eseecloud.com'): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure serverUrl has proper format
      if (!serverUrl.startsWith('http')) {
        serverUrl = `https://${serverUrl}`;
      }

      this.credentials = { username, password, serverUrl };

      // ESEE Cloud login API call
      const loginResponse = await axios.post(`${serverUrl}/api/auth/login`, {
        username,
        password,
        remember: true
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GuardDog-Surveillance/1.0'
        },
        timeout: 15000
      });

      if (loginResponse.status === 200 && loginResponse.data.token) {
        this.authToken = loginResponse.data.token;
        this.credentials.authToken = this.authToken || undefined;
        this.credentials.deviceId = loginResponse.data.deviceId;

        // Save credentials for future use
        await this.saveCredentials();

        // Load devices
        await this.loadDevices();

        this.isAuthenticated = true;
        console.log(`ESEE Cloud authentication successful for user: ${username}`);
        
        return { success: true };
      } else {
        throw new Error('Invalid response from ESEE Cloud server');
      }
    } catch (error: any) {
      console.error('ESEE Cloud authentication error:', error);
      
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return { 
          success: false, 
          error: 'Cannot connect to ESEE Cloud server. Please check the server URL and your internet connection.'
        };
      }

      if (error.response?.status === 401) {
        return { 
          success: false, 
          error: 'Invalid username or password. Please check your credentials.'
        };
      }

      return { 
        success: false, 
        error: error.message || 'Authentication failed. Please try again.'
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Attempt to logout from server
      if (this.credentials?.serverUrl && this.authToken) {
        try {
          await axios.post(`${this.credentials.serverUrl}/api/auth/logout`, {}, {
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          });
        } catch (error) {
          console.warn('Error during ESEE logout:', error);
        }
      }

      this.credentials = null;
      this.authToken = null;
      this.isAuthenticated = false;
      this.devices = [];
      
      // Remove stored credentials
      if (await fs.pathExists(this.credentialsPath)) {
        await fs.remove(this.credentialsPath);
      }
      
      console.log('ESEE Cloud account disconnected');
    } catch (error) {
      console.error('Error disconnecting ESEE Cloud account:', error);
    }
  }

  private async loadDevices(): Promise<void> {
    try {
      if (!this.isAuthenticated || !this.credentials?.serverUrl || !this.authToken) {
        return;
      }

      const response = await axios.get(`${this.credentials.serverUrl}/api/devices`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200 && response.data.devices) {
        this.devices = response.data.devices.map((device: any) => ({
          id: device.id || device.deviceId,
          name: device.name || device.deviceName,
          type: device.type || 'camera',
          status: device.online ? 'online' : 'offline',
          channels: (device.channels || []).map((channel: any, index: number) => ({
            id: channel.id || index,
            name: channel.name || `Channel ${index + 1}`,
            enabled: channel.enabled !== false,
            resolution: channel.resolution || '1080p',
            rtspUrl: this.buildRtspUrl(device, channel, index)
          })),
          rtspUrl: this.buildRtspUrl(device, null, 0)
        }));

        console.log(`Loaded ${this.devices.length} ESEE Cloud devices`);
      }
    } catch (error) {
      console.error('Error loading ESEE devices:', error);
    }
  }

  private buildRtspUrl(device: any, channel: any = null, channelIndex: number = 0): string {
    if (!this.credentials?.serverUrl || !this.credentials?.username || !this.credentials?.password) {
      return '';
    }

    const serverHost = this.credentials.serverUrl.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    const deviceId = device.id || device.deviceId;
    const channelId = channel?.id ?? channelIndex;
    
    // ESEE Cloud RTSP URL format
    return `rtsp://${this.credentials.username}:${this.credentials.password}@${serverHost}:554/cam/realmonitor?channel=${channelId}&subtype=0&device=${deviceId}`;
  }

  async getDevices(): Promise<EseeDevice[]> {
    if (!this.isAuthenticated) {
      throw new Error('ESEE Cloud not authenticated');
    }

    // Refresh devices list
    await this.loadDevices();
    return this.devices;
  }

  async getDeviceSnapshot(deviceId: string, channelId: number = 0): Promise<Buffer | null> {
    try {
      if (!this.isAuthenticated || !this.credentials?.serverUrl || !this.authToken) {
        throw new Error('ESEE Cloud not authenticated');
      }

      const response = await axios.get(`${this.credentials.serverUrl}/api/devices/${deviceId}/snapshot`, {
        params: { channel: channelId },
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        },
        responseType: 'arraybuffer',
        timeout: 15000
      });

      if (response.status === 200) {
        return Buffer.from(response.data);
      }

      return null;
    } catch (error) {
      console.error(`Error getting snapshot for device ${deviceId}:`, error);
      return null;
    }
  }

  async getDeviceInfo(deviceId: string): Promise<any | null> {
    try {
      if (!this.isAuthenticated || !this.credentials?.serverUrl || !this.authToken) {
        throw new Error('ESEE Cloud not authenticated');
      }

      const response = await axios.get(`${this.credentials.serverUrl}/api/devices/${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        return response.data;
      }

      return null;
    } catch (error) {
      console.error(`Error getting device info for ${deviceId}:`, error);
      return null;
    }
  }

  async controlDevice(deviceId: string, action: string, params: any = {}): Promise<boolean> {
    try {
      if (!this.isAuthenticated || !this.credentials?.serverUrl || !this.authToken) {
        throw new Error('ESEE Cloud not authenticated');
      }

      const response = await axios.post(`${this.credentials.serverUrl}/api/devices/${deviceId}/control`, {
        action,
        params
      }, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.status === 200;
    } catch (error) {
      console.error(`Error controlling device ${deviceId}:`, error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isAuthenticated;
  }

  getConnectionStatus(): { connected: boolean; username?: string; serverUrl?: string; deviceCount?: number } {
    if (!this.isAuthenticated || !this.credentials) {
      return { connected: false };
    }

    return {
      connected: true,
      username: this.credentials.username,
      serverUrl: this.credentials.serverUrl,
      deviceCount: this.devices.length
    };
  }

  getRtspUrl(deviceId: string, channelId: number = 0): string | null {
    const device = this.devices.find(d => d.id === deviceId);
    if (!device) return null;

    const channel = device.channels.find(c => c.id === channelId);
    return channel?.rtspUrl || device.rtspUrl || null;
  }
}

export const eseeCloudService = new EseeCloudService();