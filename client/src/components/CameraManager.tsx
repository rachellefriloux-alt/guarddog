import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  PlayArrow,
  Stop,
  Wifi,
  Doorbell,
  Camera
} from '@mui/icons-material';

interface Camera {
  id: number;
  name: string;
  type: string;
  ip_address?: string;
  port?: number;
  username?: string;
  is_active: boolean;
  stream_url?: string;
}

const CameraManager: React.FC = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [open, setOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'wifi',
    ip_address: '',
    port: 8080,
    username: '',
    password: '',
    stream_url: ''
  });

  useEffect(() => {
    fetchCameras();
  }, []);

  const fetchCameras = async () => {
    try {
      const token = localStorage.getItem('guarddog_token');
      const response = await fetch('/api/cameras', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCameras(data.cameras || []);
      }
    } catch (error) {
      console.error('Failed to fetch cameras:', error);
    }
  };

  const handleOpenDialog = (camera?: Camera) => {
    if (camera) {
      setEditingCamera(camera);
      setFormData({
        name: camera.name,
        type: camera.type,
        ip_address: camera.ip_address || '',
        port: camera.port || 8080,
        username: camera.username || '',
        password: '',
        stream_url: camera.stream_url || ''
      });
    } else {
      setEditingCamera(null);
      setFormData({
        name: '',
        type: 'wifi',
        ip_address: '',
        port: 8080,
        username: '',
        password: '',
        stream_url: ''
      });
    }
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingCamera(null);
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('guarddog_token');
      const url = editingCamera 
        ? `/api/cameras/${editingCamera.id}`
        : '/api/cameras';
      
      const method = editingCamera ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        fetchCameras();
        handleCloseDialog();
      } else {
        console.error('Failed to save camera');
      }
    } catch (error) {
      console.error('Error saving camera:', error);
    }
  };

  const handleDelete = async (cameraId: number) => {
    if (window.confirm('Are you sure you want to delete this camera?')) {
      try {
        const token = localStorage.getItem('guarddog_token');
        const response = await fetch(`/api/cameras/${cameraId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          fetchCameras();
        }
      } catch (error) {
        console.error('Error deleting camera:', error);
      }
    }
  };

  const handleTestConnection = async (cameraId: number) => {
    try {
      const token = localStorage.getItem('guarddog_token');
      const response = await fetch(`/api/cameras/${cameraId}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();
      alert(result.message);
    } catch (error) {
      console.error('Error testing connection:', error);
    }
  };

  const getCameraIcon = (type: string) => {
    switch (type) {
      case 'ring':
        return <Doorbell />;
      case 'esee':
        return <Camera />;
      case 'wifi':
        return <Wifi />;
      default:
        return <Camera />;
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Camera Manager</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => handleOpenDialog()}
        >
          Add Camera
        </Button>
      </Box>

      <Grid container spacing={3}>
        {cameras.map((camera) => (
          <Grid item xs={12} sm={6} md={4} key={camera.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  {getCameraIcon(camera.type)}
                  <Typography variant="h6" sx={{ ml: 1 }}>
                    {camera.name}
                  </Typography>
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Chip 
                    label={camera.type.toUpperCase()} 
                    variant="outlined"
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  <Chip 
                    label={camera.is_active ? 'Active' : 'Inactive'} 
                    color={camera.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </Box>

                {camera.ip_address && (
                  <Typography variant="body2" color="text.secondary">
                    IP: {camera.ip_address}
                    {camera.port && `:${camera.port}`}
                  </Typography>
                )}

                {camera.username && (
                  <Typography variant="body2" color="text.secondary">
                    Username: {camera.username}
                  </Typography>
                )}
              </CardContent>
              
              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Box>
                  <IconButton 
                    size="small" 
                    onClick={() => handleOpenDialog(camera)}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton 
                    size="small" 
                    onClick={() => handleDelete(camera.id)}
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                </Box>
                
                <Button 
                  size="small"
                  onClick={() => handleTestConnection(camera.id)}
                >
                  Test
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Add/Edit Camera Dialog */}
      <Dialog open={open} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingCamera ? 'Edit Camera' : 'Add Camera'}
        </DialogTitle>
        
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Camera Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Camera Type</InputLabel>
                <Select
                  value={formData.type}
                  label="Camera Type"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="ring">Ring Doorbell</MenuItem>
                  <MenuItem value="esee">ESEE Cloud Camera</MenuItem>
                  <MenuItem value="wifi">WiFi Camera</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={8}>
              <TextField
                fullWidth
                label="IP Address"
                value={formData.ip_address}
                onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={4}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Stream URL (Optional)"
                value={formData.stream_url}
                onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                helperText="Leave blank to use default based on camera type"
              />
            </Grid>
          </Grid>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">
            {editingCamera ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CameraManager;