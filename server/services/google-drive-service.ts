import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs-extra';
import path from 'path';
import { fileStorageService } from './file-storage-service';

export class GoogleDriveService {
  private drive: any;
  private auth: OAuth2Client;
  private folderId: string | null = null;
  private serviceAccountToken: string | null = null;

  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback'
    );

    this.serviceAccountToken = process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN || null;
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  async initialize(refreshToken?: string): Promise<boolean> {
    try {
      if (refreshToken) {
        this.auth.setCredentials({ refresh_token: refreshToken });
      }

      // Create or find GuardDog folder
      await this.ensureGuardDogFolder();
      
      if (this.serviceAccountToken) {
        console.log('Google Drive service initialized with service account support');
      } else {
        console.log('Google Drive service initialized with OAuth2 only');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive service:', error);
      return false;
    }
  }

  hasServiceAccountAccess(): boolean {
    return !!this.serviceAccountToken;
  }

  getServiceAccountToken(): string | null {
    return this.serviceAccountToken;
  }

  private async ensureGuardDogFolder(): Promise<void> {
    try {
      // Search for existing GuardDog folder
      const response = await this.drive.files.list({
        q: "name='GuardDog Surveillance' and mimeType='application/vnd.google-apps.folder'",
        fields: 'files(id, name)',
      });

      if (response.data.files && response.data.files.length > 0) {
        this.folderId = response.data.files[0].id;
        console.log('Found existing GuardDog folder:', this.folderId);
      } else {
        // Create GuardDog folder
        const folderResponse = await this.drive.files.create({
          requestBody: {
            name: 'GuardDog Surveillance',
            mimeType: 'application/vnd.google-apps.folder',
          },
          fields: 'id',
        });

        this.folderId = folderResponse.data.id;
        console.log('Created GuardDog folder:', this.folderId);
      }
    } catch (error) {
      console.error('Error managing GuardDog folder:', error);
      throw error;
    }
  }

  async uploadRecording(filePath: string, filename: string, cameraId: string): Promise<string | null> {
    try {
      if (!this.folderId) {
        throw new Error('Google Drive not initialized');
      }

      // Create camera subfolder if it doesn't exist
      const cameraFolderId = await this.ensureCameraFolder(cameraId);

      const fileBuffer = await fs.readFile(filePath);
      const fileMetadata = {
        name: filename,
        parents: [cameraFolderId],
      };

      const media = {
        mimeType: 'video/mp4',
        body: fileBuffer,
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, webViewLink',
      });

      console.log(`Uploaded ${filename} to Google Drive:`, response.data.id);
      return response.data.webViewLink;
    } catch (error) {
      console.error('Error uploading to Google Drive:', error);
      return null;
    }
  }

  async uploadSnapshot(filePath: string, filename: string, cameraId: string): Promise<string | null> {
    try {
      if (!this.folderId) {
        throw new Error('Google Drive not initialized');
      }

      const cameraFolderId = await this.ensureCameraFolder(cameraId);
      const snapshotFolderId = await this.ensureSnapshotFolder(cameraFolderId);

      const fileBuffer = await fs.readFile(filePath);
      const fileMetadata = {
        name: filename,
        parents: [snapshotFolderId],
      };

      const media = {
        mimeType: 'image/jpeg',
        body: fileBuffer,
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, webViewLink',
      });

      console.log(`Uploaded snapshot ${filename} to Google Drive:`, response.data.id);
      return response.data.webViewLink;
    } catch (error) {
      console.error('Error uploading snapshot to Google Drive:', error);
      return null;
    }
  }

  private async ensureCameraFolder(cameraId: string): Promise<string> {
    try {
      const camera = await this.getCameraInfo(cameraId);
      const folderName = `Camera_${camera?.name || cameraId}`;

      // Search for existing camera folder
      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${this.folderId}' in parents`,
        fields: 'files(id, name)',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      // Create camera folder
      const folderResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [this.folderId],
        },
        fields: 'id',
      });

      return folderResponse.data.id;
    } catch (error) {
      console.error('Error creating camera folder:', error);
      throw error;
    }
  }

  private async ensureSnapshotFolder(cameraFolderId: string): Promise<string> {
    try {
      const folderName = 'Snapshots';

      // Search for existing snapshots folder
      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${cameraFolderId}' in parents`,
        fields: 'files(id, name)',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      // Create snapshots folder
      const folderResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [cameraFolderId],
        },
        fields: 'id',
      });

      return folderResponse.data.id;
    } catch (error) {
      console.error('Error creating snapshots folder:', error);
      throw error;
    }
  }

  private async getCameraInfo(cameraId: string): Promise<any> {
    // This would typically fetch camera info from storage
    // For now, return a simple object
    return { name: `Camera_${cameraId}` };
  }

  async getStorageUsage(): Promise<{ used: number; total: number }> {
    try {
      const response = await this.drive.about.get({
        fields: 'storageQuota',
      });

      const quota = response.data.storageQuota;
      return {
        used: parseInt(quota.usage || '0'),
        total: parseInt(quota.limit || '15000000000'), // 15GB default
      };
    } catch (error) {
      console.error('Error getting storage usage:', error);
      return { used: 0, total: 15000000000 };
    }
  }

  async listFiles(cameraId?: string): Promise<any[]> {
    try {
      let query = `'${this.folderId}' in parents`;
      
      if (cameraId) {
        const cameraFolderId = await this.ensureCameraFolder(cameraId);
        query = `'${cameraFolderId}' in parents`;
      }

      const response = await this.drive.files.list({
        q: query,
        orderBy: 'createdTime desc',
        fields: 'files(id, name, createdTime, size, webViewLink)',
        pageSize: 50,
      });

      return response.data.files || [];
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    try {
      await this.drive.files.delete({
        fileId,
      });
      console.log('Deleted file from Google Drive:', fileId);
      return true;
    } catch (error) {
      console.error('Error deleting file from Google Drive:', error);
      return false;
    }
  }

  async generateDailySummaryReport(date: Date, summary: any): Promise<string | null> {
    try {
      if (!this.folderId) {
        throw new Error('Google Drive not initialized');
      }

      const reportsFolderId = await this.ensureReportsFolder();
      const dateString = date.toISOString().split('T')[0];
      const filename = `GuardDog_Daily_Summary_${dateString}.html`;

      // Generate HTML report
      const htmlContent = this.generateHTMLReport(date, summary);

      const fileMetadata = {
        name: filename,
        parents: [reportsFolderId],
      };

      const media = {
        mimeType: 'text/html',
        body: htmlContent,
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, webViewLink',
      });

      console.log(`Generated daily summary report: ${filename}`);
      return response.data.webViewLink;
    } catch (error) {
      console.error('Error generating daily summary report:', error);
      return null;
    }
  }

  private async ensureReportsFolder(): Promise<string> {
    try {
      const folderName = 'Daily Reports';

      // Search for existing reports folder
      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${this.folderId}' in parents`,
        fields: 'files(id, name)',
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      // Create reports folder
      const folderResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [this.folderId],
        },
        fields: 'id',
      });

      return folderResponse.data.id;
    } catch (error) {
      console.error('Error creating reports folder:', error);
      throw error;
    }
  }

  private generateHTMLReport(date: Date, summary: any): string {
    const dateString = date.toLocaleDateString();
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>GuardDog Daily Summary - ${dateString}</title>
    <style>
        body { font-family: 'Roboto', Arial, sans-serif; margin: 20px; background: #F5F7FA; }
        .header { background: #0066CC; color: white; padding: 20px; border-radius: 8px; }
        .summary-card { background: white; margin: 15px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #1E88E5; color: white; padding: 15px; border-radius: 8px; text-align: center; flex: 1; }
        .detection { margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 4px solid #4CAF50; }
        .alert { border-left-color: #FF5722; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛡️ GuardDog Daily Summary</h1>
        <h2>${dateString}</h2>
    </div>
    
    <div class="summary-card">
        <h3>📊 Daily Statistics</h3>
        <div class="stats">
            <div class="stat">
                <h4>${summary.totalDetections || 0}</h4>
                <p>Total Detections</p>
            </div>
            <div class="stat">
                <h4>${summary.knownPeople || 0}</h4>
                <p>Known People</p>
            </div>
            <div class="stat">
                <h4>${summary.unknownPeople || 0}</h4>
                <p>Unknown People</p>
            </div>
            <div class="stat">
                <h4>${summary.animals || 0}</h4>
                <p>Animals</p>
            </div>
            <div class="stat">
                <h4>${summary.vehicles || 0}</h4>
                <p>Vehicles</p>
            </div>
        </div>
    </div>
    
    <div class="summary-card">
        <h3>🔍 Key Events</h3>
        ${summary.notableEvents ? summary.notableEvents.map((event: any) => `
            <div class="detection ${event.type === 'alert' ? 'alert' : ''}">
                <strong>${event.time}</strong> - ${event.camera}: ${event.description}
            </div>
        `).join('') : '<p>No notable events recorded.</p>'}
    </div>
    
    <div class="summary-card">
        <h3>📹 Camera Activity</h3>
        ${summary.cameraActivity ? Object.entries(summary.cameraActivity).map(([cameraId, activity]: [string, any]) => `
            <div class="detection">
                <strong>${activity.name}</strong>: ${activity.detections} detections
                <ul>
                    ${activity.highlights.map((highlight: string) => `<li>${highlight}</li>`).join('')}
                </ul>
            </div>
        `).join('') : '<p>No camera activity recorded.</p>'}
    </div>
    
    <div class="summary-card">
        <p><small>Generated by GuardDog Surveillance System on ${new Date().toLocaleString()}</small></p>
    </div>
</body>
</html>`;
  }

  getAuthUrl(): string {
    const scopes = ['https://www.googleapis.com/auth/drive.file'];
    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }

  async handleAuthCallback(code: string): Promise<string | null> {
    try {
      const { tokens } = await this.auth.getToken(code);
      this.auth.setCredentials(tokens);
      
      if (tokens.refresh_token) {
        await this.initialize(tokens.refresh_token);
        return tokens.refresh_token;
      }
      
      return null;
    } catch (error) {
      console.error('Error handling auth callback:', error);
      return null;
    }
  }
}

export const googleDriveService = new GoogleDriveService();