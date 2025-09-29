import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Badge
} from '@mui/material';
import {
  Dashboard,
  Videocam,
  Settings as SettingsIcon,
  VideoLibrary,
  Assessment,
  ExitToApp,
  Notifications
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

const drawerWidth = 240;

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { motionAlerts, connected } = useSocket();

  const menuItems = [
    {
      text: 'Dashboard',
      icon: <Dashboard />,
      path: '/dashboard'
    },
    {
      text: 'Camera Grid',
      icon: <Videocam />,
      path: '/cameras'
    },
    {
      text: 'Camera Manager',
      icon: <SettingsIcon />,
      path: '/camera-manager'
    },
    {
      text: 'Recordings',
      icon: <VideoLibrary />,
      path: '/recordings'
    },
    {
      text: 'Reports',
      icon: <Assessment />,
      path: '/reports'
    },
    {
      text: 'Settings',
      icon: <SettingsIcon />,
      path: '/settings'
    }
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          position: 'relative',
          top: 0,
          height: 'calc(100vh - 64px)', // Subtract AppBar height
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Navigation
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Badge 
            color={connected ? 'success' : 'error'} 
            variant="dot"
            sx={{ mr: 1 }}
          >
            <Notifications />
          </Badge>
          <Typography variant="body2" color="text.secondary">
            {connected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>

        {motionAlerts.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="warning.main">
              {motionAlerts.length} recent motion alerts
            </Typography>
          </Box>
        )}
      </Box>

      <Divider />

      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
            >
              <ListItemIcon>
                {item.text === 'Dashboard' && motionAlerts.length > 0 ? (
                  <Badge badgeContent={motionAlerts.length} color="error">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={handleLogout}>
            <ListItemIcon>
              <ExitToApp />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
};

export default Navigation;