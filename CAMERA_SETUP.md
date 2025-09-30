# 📹 Camera Setup Guide

This guide explains how to connect your ESEE and Ring cameras to GuardDog for real video streaming and storage.

## 🔧 ESEE Camera Setup

ESEE cameras typically support RTSP streaming. Follow these steps:

### 1. Find Your Camera's IP Address
- Check your router's admin panel for connected devices
- Look for the camera's MAC address on the device label
- Use network scanning tools like `nmap` or apps like "Network Scanner"

### 2. Configure Camera Settings
1. Access the camera's web interface via browser: `http://[CAMERA_IP]`
2. Login with default credentials (usually admin/admin or admin/password)
3. Enable RTSP streaming in the network settings
4. Note down the RTSP path (usually `/cam/realmonitor?channel=1&subtype=0`)

### 3. Add Camera to GuardDog
Use the API endpoint or web interface:

```json
{
  "name": "Front Door ESEE",
  "type": "esee",
  "ipAddress": "192.168.1.100",
  "port": "554",
  "username": "admin",
  "password": "your-password",
  "location": "front_door",
  "resolution": "1080p",
  "streamUrl": "rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0"
}
```

## 📱 Ring Camera Setup

Ring cameras require API integration through their cloud service.

### 1. Ring API Setup
1. Install the Ring app and set up your cameras
2. The current implementation uses placeholder streams
3. For production use, you would need:
   - Ring Developer Account
   - OAuth2 credentials
   - Two-factor authentication token

### 2. Add Ring Camera
```json
{
  "name": "Front Door Ring",
  "type": "ring",
  "ipAddress": "ring-cloud",
  "location": "front_door",
  "resolution": "1080p",
  "username": "your-ring-email",
  "password": "ring-api-token"
}
```

## 🛠️ Testing Camera Connection

### Using the API
```bash
# Test camera connection
curl -X POST http://localhost:5000/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Camera",
    "type": "esee",
    "ipAddress": "192.168.1.100",
    "username": "admin",
    "password": "password",
    "location": "test"
  }'

# Start streaming
curl -X POST http://localhost:5000/api/cameras/{camera-id}/start-stream

# Check stream status
curl http://localhost:5000/api/cameras/{camera-id}/stream-status
```

### Using the Web Interface
1. Navigate to the Camera Management section
2. Click "Add Camera"
3. Fill in the camera details
4. Test the connection
5. Start streaming from the dashboard

## 📁 File Storage

### Local Storage Structure
```
storage/
├── recordings/
│   ├── camera-1/
│   │   ├── recording_2024-01-01.mp4
│   │   └── recording_2024-01-02.mp4
│   └── camera-2/
├── uploads/
│   └── user_uploaded_files/
└── snapshots/
    └── motion_detection_captures/
```

### Storage Configuration
Set environment variables in `.env`:
```env
# Storage paths
STORAGE_DIR=./storage
MAX_STORAGE_SIZE=50GB
CLEANUP_OLDER_THAN_DAYS=30

# Recording settings
RECORDING_QUALITY=high
RECORDING_FORMAT=mp4
MOTION_DETECTION_SENSITIVITY=medium
```

## 🔍 Troubleshooting

### Common ESEE Camera Issues
1. **Connection Failed**: Check IP address, username, and password
2. **No Video Stream**: Verify RTSP is enabled in camera settings
3. **Poor Quality**: Adjust stream resolution in camera web interface
4. **Frequent Disconnects**: Check network stability and WiFi signal

### Common Ring Camera Issues
1. **API Limits**: Ring has strict rate limiting
2. **Two-Factor Auth**: Requires proper token management
3. **Cloud Dependency**: Requires internet connection

### Network Requirements
- **Bandwidth**: 2-5 Mbps per 1080p camera
- **Ports**: Ensure ports 554 (RTSP) and 5000 (GuardDog) are accessible
- **Firewall**: Allow traffic between cameras and GuardDog server

## 📊 Performance Optimization

### For Multiple Cameras
1. Use wired connections when possible
2. Configure different quality levels per camera
3. Enable motion-triggered recording to save storage
4. Use H.264 compression for efficiency

### Storage Management
1. Enable automatic cleanup of old recordings
2. Set up cloud backup for important footage
3. Monitor disk space usage
4. Configure recording schedules

## 🔒 Security Best Practices

1. **Change Default Passwords**: Always change camera default credentials
2. **Network Segmentation**: Put cameras on separate VLAN
3. **HTTPS**: Use HTTPS for GuardDog web interface
4. **Regular Updates**: Keep camera firmware updated
5. **Access Control**: Limit who can access camera feeds

## 📚 Advanced Configuration

### Custom RTSP Paths
Different camera brands use different RTSP paths:
- **ESEE**: `/cam/realmonitor?channel=1&subtype=0`
- **Hikvision**: `/Streaming/Channels/101`
- **Dahua**: `/cam/realmonitor?channel=1&subtype=1`
- **Generic**: `/live` or `/stream`

### FFmpeg Parameters
Customize streaming parameters in `stream-service.ts`:
```typescript
const ffmpegArgs = [
  '-i', rtspUrl,
  '-c:v', 'libx264',      // Video codec
  '-preset', 'veryfast',   // Encoding speed
  '-crf', '23',           // Quality (lower = better)
  '-f', 'hls',            // Output format
  '-hls_time', '2',       // Segment duration
  '-hls_list_size', '10'  // Playlist size
];
```

## 🆘 Support

If you encounter issues:
1. Check the server logs: `npm run dev`
2. Verify camera connectivity: `ping [CAMERA_IP]`
3. Test RTSP stream: `ffplay rtsp://[CAMERA_URL]`
4. Check network configuration
5. Review firewall settings