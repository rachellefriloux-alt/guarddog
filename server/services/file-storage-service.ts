import fs from 'fs-extra';
import path from 'path';
import { storage } from '../storage';
import { type CloudFile, type InsertCloudFile } from '@shared/schema';

export class FileStorageService {
  private storageDir = path.join(process.cwd(), 'storage');
  private uploadsDir = path.join(this.storageDir, 'uploads');
  private recordingsDir = path.join(this.storageDir, 'recordings');
  private snapshotsDir = path.join(this.storageDir, 'snapshots');

  constructor() {
    this.initializeDirectories();
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await fs.ensureDir(this.storageDir);
      await fs.ensureDir(this.uploadsDir);
      await fs.ensureDir(this.recordingsDir);
      await fs.ensureDir(this.snapshotsDir);
      console.log('Storage directories initialized');
    } catch (error) {
      console.error('Error initializing storage directories:', error);
    }
  }

  async saveUploadedFile(file: Express.Multer.File): Promise<CloudFile> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${file.originalname}`;
    const filePath = path.join(this.uploadsDir, filename);

    // Save file to local storage
    await fs.writeFile(filePath, file.buffer);

    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = stats.size / (1024 * 1024); // Convert to MB

    // Create cloud file record
    const cloudFileData: InsertCloudFile = {
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize,
    };

    const cloudFile = await storage.createCloudFile(cloudFileData);

    return cloudFile;
  }

  async saveRecording(cameraId: string, buffer: Buffer, duration: number): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${cameraId}_${timestamp}.mp4`;
    const cameraDir = path.join(this.recordingsDir, cameraId);
    
    await fs.ensureDir(cameraDir);
    const filePath = path.join(cameraDir, filename);
    
    await fs.writeFile(filePath, buffer);
    
    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = stats.size / (1024 * 1024); // Convert to MB

    // Create recording record
    await storage.createRecording({
      cameraId,
      filename,
      duration,
      fileSize,
    });

    return filePath;
  }

  async saveSnapshot(cameraId: string, imageBuffer: Buffer): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${cameraId}_snapshot_${timestamp}.jpg`;
    const cameraDir = path.join(this.snapshotsDir, cameraId);
    
    await fs.ensureDir(cameraDir);
    const filePath = path.join(cameraDir, filename);
    
    await fs.writeFile(filePath, imageBuffer);
    
    return filePath;
  }

  async getFile(filePath: string): Promise<Buffer | null> {
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readFile(filePath);
      }
      return null;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  async getRecordingPath(cameraId: string, filename: string): Promise<string> {
    return path.join(this.recordingsDir, cameraId, filename);
  }

  async getUploadPath(filename: string): Promise<string> {
    return path.join(this.uploadsDir, filename);
  }

  async getSnapshotPath(cameraId: string, filename: string): Promise<string> {
    return path.join(this.snapshotsDir, cameraId, filename);
  }

  async getStorageStats(): Promise<{
    totalSize: number;
    recordingsSize: number;
    uploadsSize: number;
    snapshotsSize: number;
  }> {
    try {
      const getDirectorySize = async (dirPath: string): Promise<number> => {
        if (!(await fs.pathExists(dirPath))) {
          return 0;
        }
        
        const files = await fs.readdir(dirPath, { recursive: true });
        let totalSize = 0;
        
        for (const file of files) {
          const filePath = path.join(dirPath, file.toString());
          try {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              totalSize += stats.size;
            }
          } catch (error) {
            // Skip files that can't be accessed
            continue;
          }
        }
        
        return totalSize / (1024 * 1024); // Convert to MB
      };

      const [recordingsSize, uploadsSize, snapshotsSize] = await Promise.all([
        getDirectorySize(this.recordingsDir),
        getDirectorySize(this.uploadsDir),
        getDirectorySize(this.snapshotsDir),
      ]);

      const totalSize = recordingsSize + uploadsSize + snapshotsSize;

      return {
        totalSize,
        recordingsSize,
        uploadsSize,
        snapshotsSize,
      };
    } catch (error) {
      console.error('Error calculating storage stats:', error);
      return {
        totalSize: 0,
        recordingsSize: 0,
        uploadsSize: 0,
        snapshotsSize: 0,
      };
    }
  }

  async cleanupOldFiles(maxAgeInDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeInDays);

    const directories = [this.recordingsDir, this.uploadsDir, this.snapshotsDir];

    for (const dir of directories) {
      try {
        if (await fs.pathExists(dir)) {
          const files = await fs.readdir(dir, { recursive: true });
          
          for (const file of files) {
            const filePath = path.join(dir, file.toString());
            try {
              const stats = await fs.stat(filePath);
              if (stats.isFile() && stats.mtime < cutoffDate) {
                await fs.unlink(filePath);
                console.log(`Deleted old file: ${filePath}`);
              }
            } catch (error) {
              // Skip files that can't be accessed
              continue;
            }
          }
        }
      } catch (error) {
        console.error(`Error cleaning up directory ${dir}:`, error);
      }
    }
  }
}

export const fileStorageService = new FileStorageService();