import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Reports: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Reports
      </Typography>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Daily Summary Reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Exportable daily summaries with motion detection analytics coming soon.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Reports;