# GuardDog 🛡️

A comprehensive Web-based IP camera surveillance dashboard that unifies Ring doorbells and ESEE cloud cameras over WiFi with AI-powered motion detection, cloud storage integration, and real-time monitoring.

![GuardDog Dashboard](https://github.com/user-attachments/assets/6a0e73bb-0d8d-4448-b2fe-cce5cb3d22b0)

## ✨ Features

- **Multi-Camera Support**: Unifies Ring doorbells and ESEE cloud cameras
- **Real-Time Monitoring**: Live camera feeds with customizable 2x2, 3x3, and 4x4 grid layouts
- **AI Motion Detection**: Intelligent detection for people, pets, and vehicles with confidence scoring
- **Cloud Storage**: Google Drive integration for video/image storage (15GB free)
- **Real-Time Alerts**: WebSocket-powered live notifications and status updates
- **Recognition System**: In-memory recognition data for people, animals, and vehicles
- **Parity Dashboard**: Tracks combined eSeeCloud + Ring capability parity with Must/Should/Later priorities and phase rollout status
- **Dark Mode Support**: Complete dark/light theme with persistence
- **Responsive Design**: Modern UI built with React and Tailwind CSS
- **Export Reports**: Daily summary reports in HTML/CSV formats
- **24/7 Cloud-Sync Recording**: Optional `SovereignRecorder` writes RTSP streams as 10-minute MP4 segments straight into a OneDrive / iCloud / Drive sync folder — your existing cloud client uploads each finished clip with no re-encode, no bandwidth spikes, and automatic reconnect.

## 🆓 Run it for free (no paid services required)

GuardDog works without an OpenAI key and without a Google Cloud project:

| Concern         | Free / open path                                                                 |
| --------------- | -------------------------------------------------------------------------------- |
| AI vision       | Leave `OPENAI_API_KEY` unset → AI calls return a clean "disabled" response.      |
| Login           | If `GOOGLE_AUTH_CLIENT_ID` is unset, the login screen exposes a **Continue as Dev User** button that creates a local session via `/api/auth/dev-login`. |
| Database        | Omit `DATABASE_URL` → in-memory storage (data resets on restart, fine for desktop trial). For persistence, point `DATABASE_URL` at any free Postgres (Supabase, Neon, local docker). |
| Cloud storage   | Set `SOVEREIGN_STORAGE_PATH` to a folder synced by OneDrive (15 GB free), iCloud Drive (5 GB free), Google Drive desktop (15 GB free), Dropbox (2 GB free), or self-hosted Nextcloud / MinIO. |
| Vision model    | Override with the cheapest currently-supported model: `OPENAI_VISION_MODEL=gpt-4o-mini`, `OPENAI_TEXT_MODEL=gpt-4o-mini`. |

## 🏗️ Architecture

- **Backend**: Node.js/Express server with TypeScript
- **Frontend**: React + TypeScript with Vite
- **Database**: Drizzle ORM with PostgreSQL (in-memory fallback)
- **Real-time**: WebSocket server for live updates
- **Storage**: Cloud file management with upload/download capabilities
- **Authentication**: Session-based authentication system

## 🚀 Getting Started

**🎯 New to GuardDog?** See the [Quick Start Guide](QUICKSTART.md) for a 5-minute setup!

Want a downloadable desktop version? See [Desktop Packaging Guide](DESKTOP.md).

**Wiring cameras (Ring, eSeeCloud, ONVIF) into GuardDog?** See [DATA_PIPE.md](DATA_PIPE.md) for the `ring-mqtt + go2rtc + Frigate` pipeline.

### Prerequisites

- Node.js 18+ 
- npm or yarn
- (Optional) PostgreSQL for persistent storage

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rachellefriloux-alt/guarddog.git
   cd guarddog
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

   At minimum you'll need to:

   - Create a Google **OAuth Web Client** in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and copy the Client ID into `GOOGLE_AUTH_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` (you may reuse the same ID).
   - (Optional) Create a separate OAuth client for Google Drive API access and add its credentials to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if you plan to sync recordings to Drive.
   - Update `SESSION_SECRET` with a strong random string before deploying to production.
4. **Start development server**

   ```bash
   npm run dev
   ```

5. **Access the dashboard**

   ```text
   http://localhost:5000
   ```

### Production Build

```bash
npm run build
npm start
```

## 🚀 Production Deployment

### Pre-Deployment Checklist

Before deploying to production, ensure you complete these critical steps:

#### 1. Environment Configuration

```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your actual configuration
```

**Validate your configuration:**
```bash
npm run validate-env
```

**Required Configuration:**

- **SESSION_SECRET**: Generate a secure random string
  ```bash
  openssl rand -base64 32
  ```
  Add to `.env`: `SESSION_SECRET=<generated-string>`

- **Google OAuth Setup**:
  1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  2. Create an OAuth 2.0 Web Client
  3. Add authorized redirect URIs (e.g., `https://yourdomain.com/auth/google/callback`)
  4. Copy Client ID to both `GOOGLE_AUTH_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`
  5. (Optional) Create separate OAuth client for Google Drive and add to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

- **OpenAI API Key**: 
  - Get from https://platform.openai.com/api-keys
  - Add to `.env`: `OPENAI_API_KEY=<your-key>`

- **Database**: Configure PostgreSQL connection
  ```
  DATABASE_URL=postgresql://user:password@host:5432/guarddog
  ```

#### 2. Database Setup

```bash
# Push database schema
npm run db:push
```

#### 3. Production Build

```bash
# Install production dependencies
npm install --production

# Build the application
npm run build

# Verify build succeeded
ls -la dist/
```

#### 4. Security Hardening

- ✅ Ensure `.env` is not committed (check `.gitignore`)
- ✅ Set `NODE_ENV=production` in your environment
- ✅ Configure HTTPS (required for secure cookies)
- ✅ Set up firewall rules (allow only ports 80/443)
- ✅ Review `SECURITY.md` for complete security checklist

#### 5. Run Production Server

```bash
# Set production environment
export NODE_ENV=production

# Start the server
npm start
```

The server will run on port 5000 by default (or `PORT` from `.env`).

### Deployment Options

#### Option 1: Traditional Server Deployment

**Requirements:**
- Ubuntu 20.04+ or similar Linux distribution
- Node.js 18+
- PostgreSQL 13+
- Nginx (recommended as reverse proxy)

**Setup Steps:**

1. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install nodejs npm postgresql nginx
   ```

2. Clone and setup:
   ```bash
   git clone https://github.com/rachellefriloux-alt/guarddog.git
   cd guarddog
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Configure Nginx as reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

4. Setup systemd service:
   ```bash
   sudo nano /etc/systemd/system/guarddog.service
   ```
   
   ```ini
   [Unit]
   Description=GuardDog Surveillance System
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=guarddog
   WorkingDirectory=/opt/guarddog
   Environment=NODE_ENV=production
   EnvironmentFile=/opt/guarddog/.env
   ExecStart=/usr/bin/npm start
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

5. Enable and start:
   ```bash
   sudo systemctl enable guarddog
   sudo systemctl start guarddog
   sudo systemctl status guarddog
   ```

#### Option 2: Docker Deployment

**Create Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
```

**Deploy with Docker Compose:**
```yaml
version: '3.8'

services:
  guarddog:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=guarddog
      - POSTGRES_USER=guarddog
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up -d
```

#### Option 3: Cloud Platform Deployment

Compatible with:
- **Heroku**: Add `Procfile` with `web: npm start`
- **Railway**: Auto-detects Node.js applications
- **Render**: Configure via `render.yaml`
- **DigitalOcean App Platform**: Deploy from GitHub
- **AWS EC2**: Follow traditional server deployment
- **Google Cloud Run**: Containerize and deploy

### Post-Deployment

#### 1. Verify Deployment

```bash
# Check if server is running
curl https://yourdomain.com/api/health

# Test authentication
curl https://yourdomain.com/api/cameras
# Should return 401 Unauthorized if auth is working
```

#### 2. Monitor Logs

```bash
# If using systemd
sudo journalctl -u guarddog -f

# If using PM2
pm2 logs guarddog

# If using Docker
docker-compose logs -f
```

#### 3. Setup Monitoring

Consider setting up:
- Uptime monitoring (UptimeRobot, Pingdom)
- Error tracking (Sentry)
- Performance monitoring (New Relic, DataDog)
- Log aggregation (ELK Stack, Papertrail)

### Backup and Recovery

#### Database Backups

**Automated daily backups:**
```bash
# Create backup script
cat > /opt/guarddog/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/guarddog/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump guarddog > $BACKUP_DIR/guarddog_$DATE.sql
# Keep only last 30 days
find $BACKUP_DIR -name "guarddog_*.sql" -mtime +30 -delete
EOF

chmod +x /opt/guarddog/backup.sh

# Add to crontab (runs daily at 2 AM)
echo "0 2 * * * /opt/guarddog/backup.sh" | crontab -
```

#### Storage Backups

```bash
# Backup recordings and configurations
tar -czf guarddog_storage_$(date +%Y%m%d).tar.gz storage/ uploads/
```

#### Configuration Backups

- Keep `.env` file in secure location (password manager)
- Document all OAuth credentials
- Backup `storage/ring-credentials.json` securely

#### Recovery Procedure

1. Restore database:
   ```bash
   psql guarddog < backup.sql
   ```

2. Restore storage:
   ```bash
   tar -xzf guarddog_storage_backup.tar.gz
   ```

3. Restore configuration:
   - Copy `.env` file
   - Restore Ring credentials to `storage/`

4. Restart service:
   ```bash
   sudo systemctl restart guarddog
   ```

## 📋 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server  
- `npm run check` - TypeScript type checking
- `npm run db:push` - Push database schema changes
- `npm run validate-env` - Validate environment configuration
- `npm test` - Run test suite

## 🎯 API Endpoints

### Camera Management

- `GET /api/cameras` - List all cameras
- `POST /api/cameras` - Add new camera
- `PUT /api/cameras/:id` - Update camera settings
- `DELETE /api/cameras/:id` - Remove camera

### Recording & Playback

- `GET /api/recordings` - List recordings
- `POST /api/recordings` - Create new recording
- `GET /api/recordings/:id` - Get specific recording

### AI Detection

- `GET /api/detections` - List recent detections
- `POST /api/ai/detect` - Process AI detection

### Cloud Storage

- `GET /api/cloud-files` - List cloud files
- `POST /api/cloud-files/upload` - Upload file to cloud
- `DELETE /api/cloud-files/:id` - Delete cloud file

### System Stats

- `GET /api/system/stats` - Get system statistics

## 📁 Project Structure

```text
guarddog/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities and API client
│   │   └── main.tsx       # Application entry point
│   └── index.html
├── server/                # Express backend
│   ├── index.ts          # Server entry point
│   ├── routes.ts         # API routes
│   ├── storage.ts        # Data storage layer
│   └── services/         # Business logic services
├── shared/               # Shared types and schemas
│   └── schema.ts         # Database schema definitions
├── package.json
├── vite.config.ts       # Vite configuration
├── tailwind.config.ts   # Tailwind CSS configuration
└── tsconfig.json        # TypeScript configuration
```

## 🔧 Configuration

### Camera Setup

Add cameras through the web interface or API:

```json
{
  "name": "Front Door",
  "type": "ring",
  "ipAddress": "192.168.1.101",
  "streamUrl": "rtsp://192.168.1.101:554/stream",
  "location": "front_door",
  "aiDetectionEnabled": true
}
```

### Environment Variables

See `.env.example` for all available configuration options.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🛡️ Security

GuardDog includes several security features:

- Session-based authentication
- File upload validation and size limits
- Input sanitization and validation
- HTTPS support in production
- WebSocket connection security

**⚠️ Important**: See [SECURITY.md](SECURITY.md) for complete security guidelines, credential management, and production hardening checklist.

## 🔧 Troubleshooting

### Common Issues

#### Authentication Issues

**Problem**: Cannot login with Google account

**Solutions**:
1. Verify `GOOGLE_AUTH_CLIENT_ID` is set in `.env`
2. Ensure the Client ID matches the one configured in Google Cloud Console
3. Check that redirect URI is authorized: `http://localhost:5000/auth/google/callback` (development) or your production URL
4. Clear browser cookies and try again
5. Check server logs for error messages

```bash
# Verify environment variable is loaded
echo $GOOGLE_AUTH_CLIENT_ID
```

#### Database Connection Issues

**Problem**: `Error: DATABASE_URL, ensure the database is provisioned`

**Solutions**:
1. Check if PostgreSQL is running:
   ```bash
   sudo systemctl status postgresql
   ```

2. Verify DATABASE_URL format:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/guarddog
   ```

3. Test database connection:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

4. Create database if it doesn't exist:
   ```bash
   createdb guarddog
   ```

5. Run migrations:
   ```bash
   npm run db:push
   ```

**Note**: GuardDog falls back to in-memory storage if PostgreSQL is not configured. Data will be lost on restart.

#### Camera Connection Issues

**Problem**: Ring doorbell not connecting

**Solutions**:
1. Check if Ring credentials are valid:
   ```bash
   cat storage/ring-credentials.json
   ```

2. Re-authenticate with Ring:
   - Delete `storage/ring-credentials.json`
   - Use the Ring authentication API endpoint to login again
   - Follow the 2FA prompts

3. Verify network connectivity to Ring servers

4. Check Ring API status: https://status.ring.com/

**Problem**: ESEE camera not showing video

**Solutions**:
1. Verify camera IP address is correct
2. Check that camera is on the same network
3. Test RTSP stream URL:
   ```bash
   ffmpeg -i "rtsp://camera-ip:554/stream" -frames:v 1 test.jpg
   ```
4. Ensure camera credentials are correct
5. Check firewall rules allow RTSP traffic (port 554)

#### OpenAI API Issues

**Problem**: AI detection not working

**Solutions**:
1. Verify OpenAI API key is set:
   ```bash
   # Should show your key (first few characters)
   echo $OPENAI_API_KEY | cut -c1-10
   ```

2. Test API key:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

3. Check API quota and billing: https://platform.openai.com/usage

4. Verify you have access to GPT-4 Vision API

5. Check error logs for specific API error messages

#### Build Issues

**Problem**: `npm run build` fails

**Solutions**:
1. Clear build cache:
   ```bash
   rm -rf dist/ .vite/ node_modules/.vite
   ```

2. Reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Check Node.js version:
   ```bash
   node --version  # Should be 18+
   ```

4. Run type checking to see specific errors:
   ```bash
   npm run check
   ```

#### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::5000`

**Solutions**:
1. Check what's using the port:
   ```bash
   lsof -i :5000
   # or
   netstat -tuln | grep 5000
   ```

2. Kill the process:
   ```bash
   kill -9 <PID>
   ```

3. Use a different port:
   ```bash
   PORT=5001 npm run dev
   ```

#### WebSocket Connection Issues

**Problem**: Real-time updates not working

**Solutions**:
1. Check if WebSocket port (5001) is open
2. Verify proxy configuration forwards WebSocket connections
3. Check browser console for WebSocket errors
4. Ensure `Upgrade` and `Connection` headers are set correctly in proxy
5. Test WebSocket connection:
   ```javascript
   // In browser console
   const ws = new WebSocket('ws://localhost:5001');
   ws.onopen = () => console.log('Connected');
   ws.onerror = (e) => console.error('Error:', e);
   ```

#### Google Drive Upload Issues

**Problem**: Cannot upload to Google Drive

**Solutions**:
1. Verify Google Drive API is enabled in Google Cloud Console
2. Check OAuth consent screen configuration
3. Ensure Drive API scopes are requested:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.appdata`
4. Re-authenticate with Google Drive
5. Check Google Drive quota

#### Performance Issues

**Problem**: Dashboard is slow or unresponsive

**Solutions**:
1. Check system resources:
   ```bash
   htop  # or top
   ```

2. Reduce number of simultaneous camera streams
3. Lower recording quality in settings
4. Clean up old recordings:
   ```bash
   # Check storage usage
   du -sh storage/ uploads/
   ```

5. Optimize database:
   ```sql
   VACUUM ANALYZE;
   ```

6. Enable pagination for recordings list

#### Memory Issues

**Problem**: Node.js running out of memory

**Solutions**:
1. Increase Node.js memory limit:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm start
   ```

2. Reduce `CLEANUP_OLDER_THAN_DAYS` to keep fewer recordings
3. Monitor memory usage:
   ```bash
   # Add to server/index.ts for debugging
   setInterval(() => {
     const used = process.memoryUsage();
     console.log('Memory:', Math.round(used.heapUsed / 1024 / 1024), 'MB');
   }, 60000);
   ```

### Getting Help

If you're still experiencing issues:

1. **Check Logs**: Most errors are logged with details
   ```bash
   # Development
   Check terminal output
   
   # Production (systemd)
   sudo journalctl -u guarddog -n 100
   
   # Production (PM2)
   pm2 logs guarddog
   ```

2. **Enable Debug Mode**:
   ```bash
   DEBUG=* npm run dev
   ```

3. **Create GitHub Issue**: 
   - Include error messages
   - Describe steps to reproduce
   - Share relevant configuration (remove sensitive data)
   - Mention your environment (OS, Node version, etc.)

4. **Check Existing Issues**: 
   - Search [GitHub Issues](https://github.com/rachellefriloux-alt/guarddog/issues)
   - Common problems often have solutions



## 📞 Support

For support and questions:

- Create an issue on GitHub
- Check the documentation
- Review existing issues and discussions

---

Built with ❤️ for home security and surveillance needs.
