const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/guarddog.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

const initDatabase = async () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      console.log('📁 Connected to SQLite database');
      
      // Create tables
      const tables = [
        // Users table
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Cameras table
        `CREATE TABLE IF NOT EXISTS cameras (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL, -- 'ring', 'esee', 'wifi'
          ip_address TEXT,
          port INTEGER,
          username TEXT,
          password_hash TEXT,
          stream_url TEXT,
          is_active BOOLEAN DEFAULT 1,
          position_x INTEGER DEFAULT 0,
          position_y INTEGER DEFAULT 0,
          grid_size INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Recordings table
        `CREATE TABLE IF NOT EXISTS recordings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          camera_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          duration INTEGER,
          google_drive_id TEXT,
          thumbnail_path TEXT,
          motion_detected BOOLEAN DEFAULT 0,
          ai_objects TEXT, -- JSON array of detected objects
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (camera_id) REFERENCES cameras (id)
        )`,
        
        // Motion events table
        `CREATE TABLE IF NOT EXISTS motion_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          camera_id INTEGER NOT NULL,
          recording_id INTEGER,
          event_type TEXT NOT NULL, -- 'person', 'pet', 'vehicle', 'motion'
          confidence REAL,
          bounding_box TEXT, -- JSON object with coordinates
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (camera_id) REFERENCES cameras (id),
          FOREIGN KEY (recording_id) REFERENCES recordings (id)
        )`,
        
        // Settings table
        `CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Google Drive tokens table
        `CREATE TABLE IF NOT EXISTS drive_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];
      
      // Execute all table creation queries
      const createTables = tables.map(sql => {
        return new Promise((resolveTable, rejectTable) => {
          db.run(sql, (err) => {
            if (err) {
              console.error('Error creating table:', err);
              rejectTable(err);
            } else {
              resolveTable();
            }
          });
        });
      });
      
      Promise.all(createTables)
        .then(() => {
          // Insert default settings
          const defaultSettings = [
            ['dark_mode', 'false'],
            ['grid_columns', '2'],
            ['grid_rows', '2'],
            ['recording_quality', '720p'],
            ['motion_sensitivity', '0.5'],
            ['ai_detection_enabled', 'true']
          ];
          
          const insertSettings = defaultSettings.map(([key, value]) => {
            return new Promise((resolveSetting) => {
              db.run(
                'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                [key, value],
                () => resolveSetting()
              );
            });
          });
          
          return Promise.all(insertSettings);
        })
        .then(() => {
          console.log('✅ Database initialized successfully');
          resolve();
        })
        .catch(reject);
    });
  });
};

const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

const closeDatabase = () => {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
};

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};