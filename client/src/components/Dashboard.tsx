import React, { useState, useEffect } from 'react';
import {
  Grid2 as Grid,
  Card,
  CardContent,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Paper,
  LinearProgress
} from '@mui/material';
import {
  Videocam,
  Security,
  Storage,
  TrendingUp,
  Warning,
  CheckCircle,
  Person,
  Pets,
  DirectionsCar,
  NotificationImportant
} from '@mui/icons-material';
import { useSocket } from '../contexts/SocketContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalCameras: number;
  activeCameras: number;
  totalRecordings: number;
  storageUsed: number;
  motionEventsToday: number;
  peopleDetected: number;
  petsDetected: number;
  vehiclesDetected: number;
}

const Dashboard: React.FC = () => {
  const { motionAlerts, cameraStatuses, connected, aiDetections } = useSocket();
  const [stats, setStats] = useState<DashboardStats>({
    totalCameras: 0,
    activeCameras: 0,
    totalRecordings: 0,
    storageUsed: 0,
    motionEventsToday: 0,
    peopleDetected: 0,
    petsDetected: 0,
    vehiclesDetected: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem('guarddog_token');
      
      // Fetch cameras
      const camerasResponse = await fetch('/api/cameras', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const camerasData = await camerasResponse.json();
      
      // Fetch AI stats
      const aiStatsResponse = await fetch('/api/ai/stats?period=1d', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const aiStatsData = await aiStatsResponse.json();
      
      // Fetch recordings
      const recordingsResponse = await fetch('/api/recordings?limit=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const recordingsData = await recordingsResponse.json();

      const cameras = camerasData.cameras || [];
      const activeCameras = cameras.filter((c: any) => c.is_active).length;
      
      // Calculate detection counts from AI stats
      const totalCounts = aiStatsData.totalCounts || [];
      const peopleCount = totalCounts.find((c: any) => c.event_type === 'person')?.total_count || 0;
      const petsCount = totalCounts.find((c: any) => c.event_type === 'pet')?.total_count || 0;
      const vehiclesCount = totalCounts.find((c: any) => c.event_type === 'vehicle')?.total_count || 0;
      
      setStats({
        totalCameras: cameras.length,
        activeCameras,
        totalRecordings: recordingsData.recordings?.length || 0,
        storageUsed: Math.random() * 8000, // Simulated for demo
        motionEventsToday: motionAlerts.length,
        peopleDetected: peopleCount,
        petsDetected: petsCount,
        vehiclesDetected: vehiclesCount
      });
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data
  const motionChartData = motionAlerts.slice(0, 10).reverse().map((alert, index) => ({
    time: new Date(alert.timestamp).toLocaleTimeString(),
    events: index + 1
  }));

  const detectionData = [
    { name: 'People', value: stats.peopleDetected, color: '#2196f3' },
    { name: 'Pets', value: stats.petsDetected, color: '#4caf50' },
    { name: 'Vehicles', value: stats.vehiclesDetected, color: '#ff9800' }
  ];

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>Dashboard</Typography>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Videocam sx={{ mr: 2, color: 'primary.main' }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Cameras
                  </Typography>
                  <Typography variant="h5">
                    {stats.activeCameras}/{stats.totalCameras}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Storage sx={{ mr: 2, color: 'info.main' }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Storage Used
                  </Typography>
                  <Typography variant="h5">
                    {(stats.storageUsed / 1000).toFixed(1)}GB
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <NotificationImportant sx={{ mr: 2, color: 'warning.main' }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Motion Events Today
                  </Typography>
                  <Typography variant="h5">
                    {stats.motionEventsToday}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Security sx={{ mr: 2, color: connected ? 'success.main' : 'error.main' }} />
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    System Status
                  </Typography>
                  <Chip
                    label={connected ? 'Online' : 'Offline'}
                    color={connected ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Motion Events Chart */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Motion Events
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={motionChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="events" 
                      stroke="#2196f3" 
                      strokeWidth={2}
                      dot={{ fill: '#2196f3' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Detection Types Pie Chart */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                AI Detections
              </Typography>
              <Box sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={detectionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {detectionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Alerts */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Motion Alerts
              </Typography>
              <List>
                {motionAlerts.slice(0, 5).map((alert, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      {alert.eventType === 'person' ? <Person /> :
                       alert.eventType === 'pet' ? <Pets /> :
                       alert.eventType === 'vehicle' ? <DirectionsCar /> :
                       <Warning />}
                    </ListItemIcon>
                    <ListItemText
                      primary={`${alert.eventType} detected`}
                      secondary={`Camera ${alert.cameraId} - ${Math.round(alert.confidence * 100)}% confidence - ${new Date(alert.timestamp).toLocaleTimeString()}`}
                    />
                  </ListItem>
                ))}
                {motionAlerts.length === 0 && (
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText primary="No recent alerts" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Camera Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Camera Status
              </Typography>
              <List>
                {Array.from(cameraStatuses.entries()).map(([cameraId, status]) => (
                  <ListItem key={cameraId}>
                    <ListItemIcon>
                      <Videocam color={status.status === 'online' ? 'success' : 'error'} />
                    </ListItemIcon>
                    <ListItemText
                      primary={`Camera ${cameraId}`}
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Chip
                            label={status.status}
                            color={status.status === 'online' ? 'success' : 'error'}
                            size="small"
                            sx={{ mr: 1 }}
                          />
                          {status.error && (
                            <Typography variant="caption" color="error">
                              {status.error}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
                {cameraStatuses.size === 0 && (
                  <ListItem>
                    <ListItemText primary="No camera status updates" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;