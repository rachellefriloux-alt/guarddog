const express = require('express');
const { getDatabase } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// In-memory storage for recognition data
let recognitionData = {
  people: new Map(),
  animals: new Map(),
  vehicles: new Map()
};

// AI detection simulation (in a real app, this would connect to an ML service)
const simulateAIDetection = (imageData) => {
  const detectionTypes = ['person', 'pet', 'vehicle', 'motion'];
  const objects = [];
  
  // Simulate random detections
  const numObjects = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < numObjects; i++) {
    const type = detectionTypes[Math.floor(Math.random() * detectionTypes.length)];
    const confidence = 0.6 + Math.random() * 0.4; // 60-100% confidence
    
    objects.push({
      type,
      confidence: Math.round(confidence * 100) / 100,
      boundingBox: {
        x: Math.floor(Math.random() * 640),
        y: Math.floor(Math.random() * 480),
        width: Math.floor(Math.random() * 200) + 50,
        height: Math.floor(Math.random() * 200) + 50
      },
      timestamp: new Date().toISOString()
    });
  }
  
  return objects;
};

// Process image for AI detection
router.post('/detect', authenticateToken, (req, res) => {
  const { cameraId, imageData, recordingId } = req.body;
  
  if (!cameraId || !imageData) {
    return res.status(400).json({ error: 'Camera ID and image data are required' });
  }
  
  try {
    // Simulate AI detection
    const detectedObjects = simulateAIDetection(imageData);
    
    // Store detection results in database if recording ID provided
    if (recordingId && detectedObjects.length > 0) {
      const db = getDatabase();
      
      detectedObjects.forEach(obj => {
        db.run(
          `INSERT INTO motion_events (
            camera_id, recording_id, event_type, confidence, bounding_box
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            cameraId,
            recordingId,
            obj.type,
            obj.confidence,
            JSON.stringify(obj.boundingBox)
          ]
        );
      });
    }
    
    // Update in-memory recognition data
    detectedObjects.forEach(obj => {
      const id = `${cameraId}-${Date.now()}-${Math.random()}`;
      
      switch (obj.type) {
        case 'person':
          recognitionData.people.set(id, {
            id,
            cameraId,
            confidence: obj.confidence,
            boundingBox: obj.boundingBox,
            timestamp: obj.timestamp,
            recordingId
          });
          break;
        case 'pet':
          recognitionData.animals.set(id, {
            id,
            cameraId,
            confidence: obj.confidence,
            boundingBox: obj.boundingBox,
            timestamp: obj.timestamp,
            recordingId
          });
          break;
        case 'vehicle':
          recognitionData.vehicles.set(id, {
            id,
            cameraId,
            confidence: obj.confidence,
            boundingBox: obj.boundingBox,
            timestamp: obj.timestamp,
            recordingId
          });
          break;
      }
    });
    
    res.json({
      success: true,
      detectedObjects,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('AI detection error:', error);
    res.status(500).json({ error: 'AI detection failed' });
  }
});

// Get recognition data
router.get('/recognition-data', authenticateToken, (req, res) => {
  const { type, cameraId, limit = 100 } = req.query;
  
  let data = [];
  
  if (type) {
    const typeMap = recognitionData[type];
    if (typeMap) {
      data = Array.from(typeMap.values());
    }
  } else {
    // Return all types
    data = {
      people: Array.from(recognitionData.people.values()),
      animals: Array.from(recognitionData.animals.values()),
      vehicles: Array.from(recognitionData.vehicles.values())
    };
  }
  
  // Filter by camera if specified
  if (cameraId && Array.isArray(data)) {
    data = data.filter(item => item.cameraId === parseInt(cameraId));
  } else if (cameraId && typeof data === 'object') {
    Object.keys(data).forEach(key => {
      data[key] = data[key].filter(item => item.cameraId === parseInt(cameraId));
    });
  }
  
  // Apply limit
  if (Array.isArray(data)) {
    data = data.slice(0, parseInt(limit));
  }
  
  res.json({
    data,
    timestamp: new Date().toISOString()
  });
});

// Clear recognition data
router.delete('/recognition-data', authenticateToken, (req, res) => {
  const { type, cameraId, olderThan } = req.query;
  
  if (type && recognitionData[type]) {
    if (cameraId) {
      // Clear specific camera data
      const typeMap = recognitionData[type];
      for (const [key, value] of typeMap.entries()) {
        if (value.cameraId === parseInt(cameraId)) {
          typeMap.delete(key);
        }
      }
    } else if (olderThan) {
      // Clear old data
      const cutoffTime = new Date(olderThan);
      const typeMap = recognitionData[type];
      for (const [key, value] of typeMap.entries()) {
        if (new Date(value.timestamp) < cutoffTime) {
          typeMap.delete(key);
        }
      }
    } else {
      // Clear all data for this type
      recognitionData[type].clear();
    }
  } else {
    // Clear all data
    recognitionData.people.clear();
    recognitionData.animals.clear();
    recognitionData.vehicles.clear();
  }
  
  res.json({
    message: 'Recognition data cleared successfully',
    timestamp: new Date().toISOString()
  });
});

// Get motion events from database
router.get('/motion-events', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { 
    cameraId, 
    eventType, 
    startDate, 
    endDate, 
    limit = 50, 
    offset = 0 
  } = req.query;
  
  let query = `
    SELECT me.*, c.name as camera_name, r.filename as recording_filename
    FROM motion_events me
    JOIN cameras c ON me.camera_id = c.id
    LEFT JOIN recordings r ON me.recording_id = r.id
    WHERE 1=1
  `;
  let params = [];
  
  if (cameraId) {
    query += ' AND me.camera_id = ?';
    params.push(cameraId);
  }
  
  if (eventType) {
    query += ' AND me.event_type = ?';
    params.push(eventType);
  }
  
  if (startDate) {
    query += ' AND me.timestamp >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    query += ' AND me.timestamp <= ?';
    params.push(endDate);
  }
  
  query += ' ORDER BY me.timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(query, params, (err, events) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Parse bounding box JSON
    events.forEach(event => {
      if (event.bounding_box) {
        try {
          event.bounding_box = JSON.parse(event.bounding_box);
        } catch (e) {
          event.bounding_box = null;
        }
      }
    });
    
    res.json({ events });
  });
});

// Get AI detection statistics
router.get('/stats', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { cameraId, period = '7d' } = req.query;
  
  // Calculate date range based on period
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '1d':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  
  let query = `
    SELECT 
      event_type,
      COUNT(*) as count,
      AVG(confidence) as avg_confidence,
      DATE(timestamp) as date
    FROM motion_events 
    WHERE timestamp >= ?
  `;
  let params = [startDate.toISOString()];
  
  if (cameraId) {
    query += ' AND camera_id = ?';
    params.push(cameraId);
  }
  
  query += ' GROUP BY event_type, DATE(timestamp) ORDER BY date DESC';
  
  db.all(query, params, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Get total counts
    let totalQuery = `
      SELECT 
        event_type,
        COUNT(*) as total_count
      FROM motion_events 
      WHERE timestamp >= ?
    `;
    let totalParams = [startDate.toISOString()];
    
    if (cameraId) {
      totalQuery += ' AND camera_id = ?';
      totalParams.push(cameraId);
    }
    
    totalQuery += ' GROUP BY event_type';
    
    db.all(totalQuery, totalParams, (err, totals) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Get memory stats
      const memoryStats = {
        people: recognitionData.people.size,
        animals: recognitionData.animals.size,
        vehicles: recognitionData.vehicles.size
      };
      
      res.json({
        dailyStats: stats,
        totalCounts: totals,
        memoryStats,
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      });
    });
  });
});

// Update AI detection settings
router.put('/settings', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { 
    motionSensitivity, 
    aiDetectionEnabled, 
    confidenceThreshold 
  } = req.body;
  
  const settings = [];
  
  if (motionSensitivity !== undefined) {
    settings.push(['motion_sensitivity', motionSensitivity.toString()]);
  }
  
  if (aiDetectionEnabled !== undefined) {
    settings.push(['ai_detection_enabled', aiDetectionEnabled.toString()]);
  }
  
  if (confidenceThreshold !== undefined) {
    settings.push(['confidence_threshold', confidenceThreshold.toString()]);
  }
  
  if (settings.length === 0) {
    return res.status(400).json({ error: 'No settings to update' });
  }
  
  const promises = settings.map(([key, value]) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
  
  Promise.all(promises)
    .then(() => {
      res.json({ message: 'AI settings updated successfully' });
    })
    .catch((error) => {
      console.error('Settings update error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    });
});

// Get AI detection settings
router.get('/settings', authenticateToken, (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT key, value FROM settings 
     WHERE key IN ('motion_sensitivity', 'ai_detection_enabled', 'confidence_threshold')`,
    (err, settings) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      const settingsObj = {};
      settings.forEach(setting => {
        let value = setting.value;
        
        // Convert boolean strings
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        // Convert numbers
        else if (!isNaN(value) && value !== '') value = parseFloat(value);
        
        settingsObj[setting.key] = value;
      });
      
      res.json({ settings: settingsObj });
    }
  );
});

module.exports = router;