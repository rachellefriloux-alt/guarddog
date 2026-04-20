import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  IconButton,
  Paper,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  Fullscreen,
  Settings,
  PlayArrow,
  Stop
} from '@mui/icons-material';

interface Camera {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  stream_url?: string;
}

const CameraGrid: React.FC = () => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [gridColumns, setGridColumns] = useState(2);

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
    } finally {
      setLoading(false);
    }
  };

  const CameraFeed: React.FC<{ camera: Camera }> = ({ camera }) => {
    const [isStreaming, setIsStreaming] = useState(false);

    return (
      <Card sx={{ height: '300px', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" noWrap>
              {camera.name}
            </Typography>
            <Box>
              <IconButton size="small">
                <Settings />
              </IconButton>
              <IconButton size="small">
                <Fullscreen />
              </IconButton>
            </Box>
          </Box>

          <Paper
            sx={{
              height: '200px',
              bgcolor: 'grey.900',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            {camera.is_active ? (
              <Box sx={{ textAlign: 'center' }}>
                <Videocam sx={{ fontSize: 48, color: 'grey.500', mb: 1 }} />
                <Typography variant="body2" color="grey.400">
                  {camera.type.toUpperCase()} Camera
                </Typography>
                <Typography variant="caption" color="grey.500">
                  Live Feed Placeholder
                </Typography>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <VideocamOff sx={{ fontSize: 48, color: 'grey.600', mb: 1 }} />
                <Typography variant="body2" color="grey.500">
                  Camera Offline
                </Typography>
              </Box>
            )}
          </Paper>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Type: {camera.type}
            </Typography>
            <Button
              size="small"
              startIcon={isStreaming ? <Stop /> : <PlayArrow />}
              onClick={() => setIsStreaming(!isStreaming)}
              disabled={!camera.is_active}
            >
              {isStreaming ? 'Stop' : 'Start'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Camera Grid</Typography>
        <Typography>Loading cameras...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Camera Grid</Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={gridColumns === 4}
                onChange={(e) => setGridColumns(e.target.checked ? 4 : 2)}
              />
            }
            label="4x4 Grid"
          />
          <Button variant="outlined" onClick={fetchCameras}>
            Refresh
          </Button>
        </Box>
      </Box>

      {cameras.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <VideocamOff sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No cameras configured
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add cameras in the Camera Manager to see live feeds here.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {cameras.map((camera) => (
            <Grid 
              item 
              xs={12} 
              sm={gridColumns === 4 ? 3 : 6} 
              md={gridColumns === 4 ? 3 : 6}
              key={camera.id}
            >
              <CameraFeed camera={camera} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default CameraGrid;