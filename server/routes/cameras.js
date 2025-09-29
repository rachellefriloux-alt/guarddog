const express = require('express');
const { getDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all cameras
router.get('/', authenticateToken, (req, res) => {
  const db = getDatabase();
  
  db.all(
    'SELECT * FROM cameras ORDER BY created_at DESC',
    (err, cameras) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ cameras });
    }
  );
});

// Get single camera
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get(
    'SELECT * FROM cameras WHERE id = ?',
    [id],
    (err, camera) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      res.json({ camera });
    }
  );
});

// Add new camera
router.post('/', authenticateToken, (req, res) => {
  const db = getDatabase();
  const {
    name,
    type,
    ip_address,
    port,
    username,
    password,
    stream_url,
    position_x = 0,
    position_y = 0,
    grid_size = 1
  } = req.body;
  
  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }
  
  // Hash password if provided
  let password_hash = null;
  if (password) {
    const bcrypt = require('bcryptjs');
    password_hash = bcrypt.hashSync(password, 10);
  }
  
  db.run(
    `INSERT INTO cameras (
      name, type, ip_address, port, username, password_hash, 
      stream_url, position_x, position_y, grid_size
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, type, ip_address, port, username, password_hash, stream_url, position_x, position_y, grid_size],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to add camera' });
      }
      
      // Get the newly created camera
      db.get(
        'SELECT * FROM cameras WHERE id = ?',
        [this.lastID],
        (err, camera) => {
          if (err) {
            return res.status(500).json({ error: 'Camera added but failed to retrieve' });
          }
          
          res.status(201).json({
            message: 'Camera added successfully',
            camera
          });
        }
      );
    }
  );
});

// Update camera
router.put('/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const updates = req.body;
  
  // Hash password if provided in updates
  if (updates.password) {
    const bcrypt = require('bcryptjs');
    updates.password_hash = bcrypt.hashSync(updates.password, 10);
    delete updates.password;
  }
  
  // Build dynamic update query
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(id);
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  db.run(
    `UPDATE cameras SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update camera' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      // Get updated camera
      db.get(
        'SELECT * FROM cameras WHERE id = ?',
        [id],
        (err, camera) => {
          if (err) {
            return res.status(500).json({ error: 'Camera updated but failed to retrieve' });
          }
          
          res.json({
            message: 'Camera updated successfully',
            camera
          });
        }
      );
    }
  );
});

// Delete camera
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.run(
    'DELETE FROM cameras WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete camera' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      res.json({ message: 'Camera deleted successfully' });
    }
  );
});

// Test camera connection
router.post('/:id/test', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get(
    'SELECT * FROM cameras WHERE id = ?',
    [id],
    async (err, camera) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      // Simulate camera connection test
      // In a real implementation, this would test the actual camera connection
      try {
        // For demo purposes, simulate success/failure based on camera type
        const isOnline = Math.random() > 0.2; // 80% success rate
        
        if (isOnline) {
          res.json({
            success: true,
            message: 'Camera connection successful',
            status: 'online',
            timestamp: new Date().toISOString()
          });
        } else {
          res.json({
            success: false,
            message: 'Camera connection failed',
            status: 'offline',
            error: 'Connection timeout',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Connection test failed',
          error: error.message
        });
      }
    }
  );
});

// Get camera stream URL
router.get('/:id/stream', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get(
    'SELECT stream_url, type, ip_address, port FROM cameras WHERE id = ?',
    [id],
    (err, camera) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      // Generate stream URL based on camera type
      let streamUrl = camera.stream_url;
      
      if (!streamUrl && camera.ip_address) {
        // Generate default stream URLs based on camera type
        switch (camera.type) {
          case 'ring':
            // Ring cameras would use their API
            streamUrl = `/api/cameras/${id}/ring-stream`;
            break;
          case 'esee':
            // ESEE cameras typically use RTSP
            streamUrl = `rtsp://${camera.ip_address}:${camera.port || 554}/stream`;
            break;
          case 'wifi':
            // Generic WiFi cameras often use HTTP streaming
            streamUrl = `http://${camera.ip_address}:${camera.port || 8080}/stream`;
            break;
          default:
            streamUrl = null;
        }
      }
      
      res.json({
        streamUrl,
        type: camera.type,
        timestamp: new Date().toISOString()
      });
    }
  );
});

module.exports = router;