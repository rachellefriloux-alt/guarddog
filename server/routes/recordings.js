const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/recordings');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `recording-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed.'));
    }
  }
});

// Get all recordings
router.get('/', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { camera_id, limit = 50, offset = 0 } = req.query;
  
  let query = `
    SELECT r.*, c.name as camera_name 
    FROM recordings r 
    JOIN cameras c ON r.camera_id = c.id
  `;
  let params = [];
  
  if (camera_id) {
    query += ' WHERE r.camera_id = ?';
    params.push(camera_id);
  }
  
  query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(query, params, (err, recordings) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Parse AI objects JSON
    recordings.forEach(recording => {
      if (recording.ai_objects) {
        try {
          recording.ai_objects = JSON.parse(recording.ai_objects);
        } catch (e) {
          recording.ai_objects = [];
        }
      } else {
        recording.ai_objects = [];
      }
    });
    
    res.json({ recordings });
  });
});

// Get single recording
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get(
    `SELECT r.*, c.name as camera_name 
     FROM recordings r 
     JOIN cameras c ON r.camera_id = c.id 
     WHERE r.id = ?`,
    [id],
    (err, recording) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      
      // Parse AI objects JSON
      if (recording.ai_objects) {
        try {
          recording.ai_objects = JSON.parse(recording.ai_objects);
        } catch (e) {
          recording.ai_objects = [];
        }
      } else {
        recording.ai_objects = [];
      }
      
      res.json({ recording });
    }
  );
});

// Upload new recording
router.post('/', authenticateToken, upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }
  
  const db = getDatabase();
  const {
    camera_id,
    duration,
    motion_detected = false,
    ai_objects = '[]'
  } = req.body;
  
  if (!camera_id) {
    return res.status(400).json({ error: 'Camera ID is required' });
  }
  
  const filename = req.file.filename;
  const file_path = req.file.path;
  const file_size = req.file.size;
  
  db.run(
    `INSERT INTO recordings (
      camera_id, filename, file_path, file_size, duration, 
      motion_detected, ai_objects
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [camera_id, filename, file_path, file_size, duration, motion_detected, ai_objects],
    function(err) {
      if (err) {
        // Clean up uploaded file on database error
        fs.unlink(file_path, () => {});
        return res.status(500).json({ error: 'Failed to save recording' });
      }
      
      // Get the newly created recording
      db.get(
        `SELECT r.*, c.name as camera_name 
         FROM recordings r 
         JOIN cameras c ON r.camera_id = c.id 
         WHERE r.id = ?`,
        [this.lastID],
        (err, recording) => {
          if (err) {
            return res.status(500).json({ error: 'Recording saved but failed to retrieve' });
          }
          
          res.status(201).json({
            message: 'Recording uploaded successfully',
            recording
          });
        }
      );
    }
  );
});

// Stream recording file
router.get('/:id/stream', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get(
    'SELECT file_path, filename FROM recordings WHERE id = ?',
    [id],
    (err, recording) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      
      const filePath = recording.file_path;
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Recording file not found' });
      }
      
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      
      if (range) {
        // Support for video streaming with range requests
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
      }
    }
  );
});

// Delete recording
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  // Get recording info first
  db.get(
    'SELECT file_path FROM recordings WHERE id = ?',
    [id],
    (err, recording) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      
      // Delete from database
      db.run(
        'DELETE FROM recordings WHERE id = ?',
        [id],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to delete recording' });
          }
          
          // Delete file from filesystem
          if (fs.existsSync(recording.file_path)) {
            fs.unlink(recording.file_path, (err) => {
              if (err) {
                console.error('Failed to delete recording file:', err);
              }
            });
          }
          
          res.json({ message: 'Recording deleted successfully' });
        }
      );
    }
  );
});

// Get recording thumbnail
router.get('/:id/thumbnail', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get(
    'SELECT thumbnail_path FROM recordings WHERE id = ?',
    [id],
    (err, recording) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!recording || !recording.thumbnail_path) {
        return res.status(404).json({ error: 'Thumbnail not found' });
      }
      
      if (!fs.existsSync(recording.thumbnail_path)) {
        return res.status(404).json({ error: 'Thumbnail file not found' });
      }
      
      res.sendFile(path.resolve(recording.thumbnail_path));
    }
  );
});

// Update recording metadata
router.put('/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const { motion_detected, ai_objects } = req.body;
  
  const updates = {};
  if (motion_detected !== undefined) updates.motion_detected = motion_detected;
  if (ai_objects !== undefined) updates.ai_objects = JSON.stringify(ai_objects);
  
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(id);
  
  db.run(
    `UPDATE recordings SET ${fields} WHERE id = ?`,
    values,
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update recording' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      
      res.json({ message: 'Recording updated successfully' });
    }
  );
});

module.exports = router;