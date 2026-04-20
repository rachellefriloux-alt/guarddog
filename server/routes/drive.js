const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Google Drive configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Helper function to get stored tokens
const getStoredTokens = () => {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get(
      'SELECT * FROM drive_tokens ORDER BY created_at DESC LIMIT 1',
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
};

// Helper function to save tokens
const saveTokens = (tokens) => {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    const expires_at = new Date(tokens.expiry_date).toISOString();
    
    db.run(
      'INSERT INTO drive_tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)',
      [tokens.access_token, tokens.refresh_token, expires_at],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

// Helper function to refresh tokens if needed
const ensureValidTokens = async () => {
  try {
    const storedTokens = await getStoredTokens();
    
    if (!storedTokens) {
      throw new Error('No Google Drive tokens found. Please authenticate first.');
    }
    
    const now = new Date();
    const expiresAt = new Date(storedTokens.expires_at);
    
    oauth2Client.setCredentials({
      access_token: storedTokens.access_token,
      refresh_token: storedTokens.refresh_token,
      expiry_date: expiresAt.getTime()
    });
    
    // Refresh token if it expires in the next 5 minutes
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      
      // Save new tokens
      if (credentials.access_token && credentials.refresh_token) {
        await saveTokens(credentials);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};

// Get Google Drive authorization URL
router.get('/auth-url', authenticateToken, (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive'
  ];
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  
  res.json({ authUrl });
});

// Handle OAuth callback
router.post('/auth-callback', authenticateToken, async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    await saveTokens(tokens);
    
    res.json({
      message: 'Google Drive authentication successful',
      authenticated: true
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({ error: 'Failed to authenticate with Google Drive' });
  }
});

// Check authentication status
router.get('/auth-status', authenticateToken, async (req, res) => {
  try {
    const storedTokens = await getStoredTokens();
    
    if (!storedTokens) {
      return res.json({ authenticated: false });
    }
    
    const now = new Date();
    const expiresAt = new Date(storedTokens.expires_at);
    
    res.json({
      authenticated: true,
      expires_at: storedTokens.expires_at,
      expires_soon: expiresAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000 // 24 hours
    });
  } catch (error) {
    console.error('Auth status check error:', error);
    res.status(500).json({ error: 'Failed to check authentication status' });
  }
});

// Upload recording to Google Drive
router.post('/upload/:recordingId', authenticateToken, async (req, res) => {
  const { recordingId } = req.params;
  const db = getDatabase();
  
  try {
    await ensureValidTokens();
    
    // Get recording info
    const recording = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM recordings WHERE id = ?',
        [recordingId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    if (!fs.existsSync(recording.file_path)) {
      return res.status(404).json({ error: 'Recording file not found' });
    }
    
    // Create folder structure in Drive
    const year = new Date(recording.created_at).getFullYear();
    const month = new Date(recording.created_at).getMonth() + 1;
    const folderName = `Guarddog Recordings/${year}/${month.toString().padStart(2, '0')}`;
    
    // Upload file to Google Drive
    const fileMetadata = {
      name: recording.filename,
      parents: [] // We'll implement folder creation later
    };
    
    const media = {
      mimeType: 'video/mp4',
      body: fs.createReadStream(recording.file_path)
    };
    
    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });
    
    const driveFileId = driveResponse.data.id;
    
    // Update recording with Google Drive ID
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE recordings SET google_drive_id = ? WHERE id = ?',
        [driveFileId, recordingId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    res.json({
      message: 'Recording uploaded to Google Drive successfully',
      driveFileId,
      filename: recording.filename
    });
    
  } catch (error) {
    console.error('Drive upload error:', error);
    res.status(500).json({ error: 'Failed to upload to Google Drive' });
  }
});

// Get Drive storage usage
router.get('/storage', authenticateToken, async (req, res) => {
  try {
    await ensureValidTokens();
    
    const about = await drive.about.get({
      fields: 'storageQuota'
    });
    
    const quota = about.data.storageQuota;
    const used = parseInt(quota.usage || 0);
    const limit = parseInt(quota.limit || 0);
    const usedByGuarddog = await getGuarddogStorageUsage();
    
    res.json({
      total: limit,
      used: used,
      available: limit - used,
      usedByGuarddog: usedByGuarddog,
      usagePercentage: limit > 0 ? (used / limit) * 100 : 0
    });
    
  } catch (error) {
    console.error('Storage check error:', error);
    res.status(500).json({ error: 'Failed to check storage usage' });
  }
});

// Helper function to calculate Guarddog storage usage
const getGuarddogStorageUsage = async () => {
  const db = getDatabase();
  
  return new Promise((resolve) => {
    db.get(
      'SELECT SUM(file_size) as total_size FROM recordings WHERE google_drive_id IS NOT NULL',
      (err, row) => {
        if (err) {
          resolve(0);
        } else {
          resolve(row.total_size || 0);
        }
      }
    );
  });
};

// List files in Google Drive
router.get('/files', authenticateToken, async (req, res) => {
  try {
    await ensureValidTokens();
    
    const response = await drive.files.list({
      q: "name contains 'guarddog' or parents in (select id from files where name='Guarddog Recordings')",
      fields: 'files(id, name, size, createdTime, mimeType)',
      orderBy: 'createdTime desc'
    });
    
    res.json({
      files: response.data.files || []
    });
    
  } catch (error) {
    console.error('Drive files list error:', error);
    res.status(500).json({ error: 'Failed to list Google Drive files' });
  }
});

// Delete file from Google Drive
router.delete('/files/:fileId', authenticateToken, async (req, res) => {
  const { fileId } = req.params;
  
  try {
    await ensureValidTokens();
    
    await drive.files.delete({
      fileId: fileId
    });
    
    // Update recording to remove Google Drive ID
    const db = getDatabase();
    db.run(
      'UPDATE recordings SET google_drive_id = NULL WHERE google_drive_id = ?',
      [fileId]
    );
    
    res.json({ message: 'File deleted from Google Drive successfully' });
    
  } catch (error) {
    console.error('Drive file deletion error:', error);
    res.status(500).json({ error: 'Failed to delete file from Google Drive' });
  }
});

// Download file from Google Drive
router.get('/download/:fileId', authenticateToken, async (req, res) => {
  const { fileId } = req.params;
  
  try {
    await ensureValidTokens();
    
    const file = await drive.files.get({
      fileId: fileId,
      fields: 'name, mimeType'
    });
    
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: 'stream' });
    
    res.setHeader('Content-Type', file.data.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.data.name}"`);
    
    response.data.pipe(res);
    
  } catch (error) {
    console.error('Drive download error:', error);
    res.status(500).json({ error: 'Failed to download file from Google Drive' });
  }
});

module.exports = router;