import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Settings: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          System Configuration
        </Typography>
        <Typography variant="body2" color="text.secondary">
          AI detection settings, user preferences, and system configuration coming soon.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Settings;