import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { insertCameraSchema, type InsertCamera } from '@shared/schema';

interface CameraSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CameraSettingsModal({ isOpen, onClose }: CameraSettingsModalProps) {
  const { toast } = useToast();

  const form = useForm<InsertCamera>({
    resolver: zodResolver(insertCameraSchema),
    defaultValues: {
      name: '',
      type: 'ring',
      ipAddress: '',
      port: '554',
      streamUrl: '',
      username: 'admin',
      password: '',
      location: '',
      resolution: '1080p',
      isOnline: true,
      wifiStrength: 100,
      aiDetectionEnabled: true,
      detectPeople: true,
      detectPets: true,
      detectVehicles: false,
      isRecording: true,
    },
  });

  const createCameraMutation = useMutation({
    mutationFn: async (data: InsertCamera) => {
      return apiRequest('POST', '/api/cameras', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cameras'] });
      toast({
        title: "Camera added successfully",
        description: "The new camera has been configured and added to your system",
      });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add camera",
        description: error.message || "There was an error adding the camera",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertCamera) => {
    // Generate stream URL if not provided
    if (!data.streamUrl) {
      data.streamUrl = `rtsp://${data.ipAddress}:${data.port}/stream`;
    }
    
    createCameraMutation.mutate(data);
  };

  const handleClose = () => {
    if (!createCameraMutation.isPending) {
      onClose();
      form.reset();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="camera-settings-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Add New Camera
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose}
              disabled={createCameraMutation.isPending}
              data-testid="button-close-modal"
            >
              <X size={20} />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Camera Type</Label>
              <Select 
                value={form.watch('type')} 
                onValueChange={(value: 'ring' | 'esee' | 'generic') => form.setValue('type', value)}
              >
                <SelectTrigger data-testid="select-camera-type">
                  <SelectValue placeholder="Select camera type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ring">Ring Doorbell</SelectItem>
                  <SelectItem value="esee">ESEE Cloud Camera</SelectItem>
                  <SelectItem value="generic">Generic IP Camera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="name">Camera Name</Label>
              <Input
                {...form.register('name')}
                placeholder="e.g., Front Door"
                data-testid="input-camera-name"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ipAddress">IP Address</Label>
              <Input
                {...form.register('ipAddress')}
                placeholder="192.168.1.100"
                data-testid="input-ip-address"
              />
              {form.formState.errors.ipAddress && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.ipAddress.message}</p>
              )}
            </div>
            
            <div>
              <Label htmlFor="port">Port</Label>
              <Input
                {...form.register('port')}
                placeholder="554"
                data-testid="input-port"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              {...form.register('location')}
              placeholder="e.g., front_door, backyard, driveway"
              data-testid="input-location"
            />
            {form.formState.errors.location && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.location.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="streamUrl">Stream URL (Optional)</Label>
            <Input
              {...form.register('streamUrl')}
              placeholder="rtsp://192.168.1.100:554/stream"
              data-testid="input-stream-url"
            />
            <p className="text-sm text-muted-foreground mt-1">
              If left empty, will be generated automatically
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                {...form.register('username')}
                placeholder="admin"
                data-testid="input-username"
              />
            </div>
            
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                {...form.register('password')}
                type="password"
                placeholder="••••••••"
                data-testid="input-password"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-3 block">AI Detection Settings</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="detectPeople"
                  checked={form.watch('detectPeople')}
                  onCheckedChange={(checked) => form.setValue('detectPeople', !!checked)}
                  data-testid="checkbox-detect-people"
                />
                <Label htmlFor="detectPeople" className="text-sm">Enable People Detection</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="detectPets"
                  checked={form.watch('detectPets')}
                  onCheckedChange={(checked) => form.setValue('detectPets', !!checked)}
                  data-testid="checkbox-detect-pets"
                />
                <Label htmlFor="detectPets" className="text-sm">Enable Pet Detection</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="detectVehicles"
                  checked={form.watch('detectVehicles')}
                  onCheckedChange={(checked) => form.setValue('detectVehicles', !!checked)}
                  data-testid="checkbox-detect-vehicles"
                />
                <Label htmlFor="detectVehicles" className="text-sm">Enable Vehicle Detection</Label>
              </div>
            </div>
          </div>

          <div className="flex space-x-4 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={handleClose}
              disabled={createCameraMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-primary text-primary-foreground hover:opacity-90"
              disabled={createCameraMutation.isPending}
              data-testid="button-add-camera"
            >
              {createCameraMutation.isPending ? 'Adding...' : 'Add Camera'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
