import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

interface EseeCamera {
  id: string;
  name: string;
  ip: string;
  port: number;
  username: string;
  password: string;
  model?: string;
  status: 'online' | 'offline';
  channels: EseeCameraChannel[];
  lastSeen: Date;
}

interface EseeCameraChannel {
  id: number;
  name: string;
  enabled: boolean;
  resolution: string;
  rtspUrl: string;
  snapshotUrl: string;
}

interface EseeCameraCredentials {
  cameras: EseeCamera[];
}

export class EseeCloudService {
  private cameras: EseeCamera[] = [];
  private configPath = path.join(process.cwd(), 'storage', 'esee-cameras.json');

  constructor() {
    this.loadStoredCameras();
  }

  private async loadStoredCameras(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const config = await fs.readJson(this.configPath);
        this.cameras = config.cameras || [];
        console.log(`Loaded ${this.cameras.length} ESEE cameras from storage`);
      }
    } catch (error) {
      console.error('Error loading stored ESEE cameras:', error);
      this.cameras = [];
    }
  }

  private async saveCameraConfig(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      const config = { cameras: this.cameras };
      await fs.writeJson(this.configPath, config, { spaces: 2 });
    } catch (error) {
      console.error('Error saving ESEE camera configuration:', error);
    }
  }

  private async testCameraConnection(ip: string, port: number, username: string, password: string): Promise<boolean> {
    try {
      // Test HTTP snapshot endpoint
      const snapshotUrl = `http://${ip}:${port}/snapshot.jpg?user=${username}&pwd=${password}`;
      const response = await axios.get(snapshotUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });

      return response.status === 200;
    } catch (error) {
      console.warn(`Failed to connect to ESEE camera at ${ip}:${port}:`, (error as any)?.message || 'Unknown error');
      return false;
    }
  }



  private generateCameraChannels(ip: string, port: number, username: string, password: string): EseeCameraChannel[] {
    const baseUrl = `http://${ip}:${port}`;
    
    // Common ESEE camera URL patterns from iSpyConnect database
    const urlPatterns = [
      {
        rtsp: `rtsp://${username}:${password}@${ip}:554/ch0_0.264`,
        snapshot: `${baseUrl}/snapshot.jpg?user=${username}&pwd=${password}`,
        name: 'Main Stream'
      },
      {
        rtsp: `rtsp://${username}:${password}@${ip}:554/ch0_1.264`,
        snapshot: `${baseUrl}/snapshot.jpg?user=${username}&pwd=${password}&strm=1`,
        name: 'Sub Stream'
      },
      {
        rtsp: `rtsp://${username}:${password}@${ip}:554/live/ch0`,
        snapshot: `${baseUrl}/cgi-bin/snapshot.cgi?chn=0&u=${username}&p=${password}`,
        name: 'Channel 0'
      }
    ];

    return urlPatterns.map((pattern, index) => ({
      id: index,
      name: pattern.name,
      enabled: true,
      resolution: index === 0 ? 'HD' : 'SD',
      rtspUrl: pattern.rtsp,
      snapshotUrl: pattern.snapshot
    }));
  }

  async addCamera(ip: string, port: number = 80, username: string, password: string, name?: string): Promise<EseeCamera> {
    try {
      console.log(`Adding ESEE camera at ${ip}:${port}...`);

      // Test connectivity first
      const isConnected = await this.testCameraConnection(ip, port, username, password);
      if (!isConnected) {
        throw new Error(`Cannot connect to ESEE camera at ${ip}:${port}`);
      }

      // Generate channel configurations for this camera
      const channels = this.generateCameraChannels(ip, port, username, password);
      
      const camera: EseeCamera = {
        id: `esee_${ip.replace(/\./g, '_')}_${port}`,
        ip,
        port,
        username,
        password,
        name: name || `ESEE Camera ${ip}`,
        channels,
        lastSeen: new Date(),
        status: 'online'
      };

      // Add to cameras array
      this.cameras.push(camera);
      
      // Save camera configuration
      await this.saveCameraConfig();
      
      console.log(`Successfully added ESEE camera: ${camera.name}`);
      return camera;
    } catch (error) {
      console.error('Failed to add ESEE camera:', error);
      throw error;
    }
  }

  async removeCamera(cameraId: string): Promise<boolean> {
    try {
      const cameraIndex = this.cameras.findIndex(camera => camera.id === cameraId);
      
      if (cameraIndex === -1) {
        console.warn(`Camera with ID ${cameraId} not found`);
        return false;
      }

      const camera = this.cameras[cameraIndex];
      console.log(`Removing ESEE camera: ${camera.name} (${camera.ip}:${camera.port})`);

      // Remove from cameras array
      this.cameras.splice(cameraIndex, 1);
      
      // Save updated configuration
      await this.saveCameraConfig();
      
      console.log(`Successfully removed ESEE camera: ${camera.name}`);
      return true;
    } catch (error) {
      console.error('Error removing ESEE camera:', error);
      return false;
    }
  }

  async getCameras(): Promise<EseeCamera[]> {
    return this.cameras;
  }

  async getCameraById(cameraId: string): Promise<EseeCamera | null> {
    return this.cameras.find(camera => camera.id === cameraId) || null;
  }

  async updateCameraStatus(cameraId: string, status: 'online' | 'offline'): Promise<void> {
    const camera = this.cameras.find(c => c.id === cameraId);
    if (camera) {
      camera.status = status;
      camera.lastSeen = new Date();
      await this.saveCameraConfig();
    }
  }

  getRTSPUrl(cameraId: string, channelIndex: number = 0): string {
    const camera = this.cameras.find(c => c.id === cameraId);
    if (!camera || channelIndex >= camera.channels.length) {
      return '';
    }

    return camera.channels[channelIndex].rtspUrl;
  }

  getSnapshotUrl(cameraId: string, channelIndex: number = 0): string {
    const camera = this.cameras.find(c => c.id === cameraId);
    if (!camera || channelIndex >= camera.channels.length) {
      return '';
    }

    return camera.channels[channelIndex].snapshotUrl;
  }

  async getSnapshot(cameraId: string, channelIndex: number = 0): Promise<Buffer | null> {
    try {
      const snapshotUrl = this.getSnapshotUrl(cameraId, channelIndex);
      if (!snapshotUrl) {
        console.warn(`No snapshot URL found for camera ${cameraId}, channel ${channelIndex}`);
        return null;
      }

      const response = await axios.get(snapshotUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        validateStatus: (status) => status === 200
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error(`Error getting snapshot from ESEE camera ${cameraId}:`, (error as any)?.message || 'Unknown error');
      return null;
    }
  }

  async testAllCameras(): Promise<{ cameraId: string; connected: boolean }[]> {
    const results = [];
    
    for (const camera of this.cameras) {
      const connected = await this.testCameraConnection(camera.ip, camera.port, camera.username, camera.password);
      results.push({ cameraId: camera.id, connected });
      
      // Update camera status based on test
      await this.updateCameraStatus(camera.id, connected ? 'online' : 'offline');
    }
    
    return results;
  }

  isConnected(): boolean {
    return this.cameras.length > 0;
  }

  getConnectionStatus(): { connected: boolean; cameraCount: number } {
    return {
      connected: this.cameras.length > 0,
      cameraCount: this.cameras.length
    };
  }
}

export const eseeCloudService = new EseeCloudService();