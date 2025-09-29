import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const RecordingsList: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Recordings
      </Typography>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Recordings Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Video playback, Google Drive integration, and file management coming soon.
        </Typography>
      </Paper>
    </Box>
  );
};

export default RecordingsList;