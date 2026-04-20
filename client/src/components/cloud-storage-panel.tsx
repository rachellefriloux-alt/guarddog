import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CloudUpload, Download, Video, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { type CloudFile } from '@shared/schema';

export default function CloudStoragePanel() {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: cloudFiles = [] } = useQuery<CloudFile[]>({
    queryKey: ['/api/cloud-files'],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      return apiRequest('POST', '/api/cloud-files/upload', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cloud-files'] });
      toast({
        title: "Upload successful",
        description: "File has been uploaded to cloud storage",
      });
    },
    onError: () => {
      toast({
        title: "Upload failed",
        description: "Failed to upload file to cloud storage",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return apiRequest('DELETE', `/api/cloud-files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cloud-files'] });
      toast({
        title: "File deleted",
        description: "File has been removed from cloud storage",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete file from cloud storage",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      toast({
        title: "File too large",
        description: "File size must be less than 100MB",
        variant: "destructive",
      });
      return;
    }
    
    uploadMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Calculate storage usage (simulated)
  const totalStorage = 15 * 1024; // 15GB in MB
  const usedStorage = cloudFiles.reduce((total, file) => total + file.fileSize, 0);
  const usagePercentage = (usedStorage / totalStorage) * 100;

  return (
    <Card data-testid="cloud-storage-panel">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <CloudUpload className="text-primary" size={20} />
          <h3 className="text-lg font-semibold">Cloud Storage</h3>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Storage Usage */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Google Drive</span>
            <span className="text-sm text-muted-foreground" data-testid="storage-usage">
              {usedStorage.toFixed(1)}MB / {(totalStorage / 1024).toFixed(0)}GB
            </span>
          </div>
          <Progress value={usagePercentage} className="h-2" data-testid="storage-progress" />
        </div>

        {/* Upload Interface */}
        <div 
          className={`border-2 border-dashed rounded-lg p-6 text-center mb-4 transition-colors ${
            isDragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          data-testid="upload-zone"
        >
          <CloudUpload size={32} className="text-muted-foreground mb-2 mx-auto" />
          <p className="text-sm text-muted-foreground mb-2">Drop files here or</p>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-browse-files"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Browse Files'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
            accept="video/*,image/*"
          />
        </div>

        {/* Recent Files */}
        <div>
          <h4 className="font-medium mb-3">Recent Files</h4>
          {cloudFiles.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground" data-testid="no-files">
              <p>No files uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="files-list">
              {cloudFiles.slice(0, 5).map((file) => (
                <div 
                  key={file.id} 
                  className="flex items-center justify-between p-2 hover:bg-muted rounded"
                  data-testid={`file-${file.id}`}
                >
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <Video size={16} className="text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" data-testid={`file-name-${file.id}`}>
                        {file.filename}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid={`file-size-${file.id}`}>
                        {file.fileSize.toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-xs px-2"
                      data-testid={`button-download-file-${file.id}`}
                    >
                      <Download size={12} />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-xs px-2 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(file.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-file-${file.id}`}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Status */}
        <div className="mt-4 p-3 bg-success/10 rounded-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle className="text-success" size={16} />
            <span className="text-sm text-success font-medium" data-testid="sync-status">
              All recordings synced
            </span>
          </div>
          <p className="text-xs text-success/80 mt-1" data-testid="last-sync">
            Last sync: 2 minutes ago
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
