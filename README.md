# Guarddog

AI surveillance of multiple cam systems - A comprehensive Web-based IP camera surveillance dashboard.

## Features

### 🎥 Camera Integration
- **Ring doorbell integration** - Connect and manage Ring doorbells
- **ESEE cloud cameras** - Support for ESEE cloud camera systems
- **WiFi camera support** - Generic WiFi camera connectivity
- **Multi-camera grid views** - Customizable 2x2 and 4x4 grid layouts
- **Real-time streaming** - Live video feeds from all connected cameras

### 🤖 AI-Powered Detection
- **Motion detection** - Intelligent motion sensing
- **People detection** - AI-powered human recognition
- **Pet detection** - Automatic pet identification
- **Vehicle detection** - Car and vehicle recognition
- **In-memory recognition data** - Fast access to detection results
- **Confidence scoring** - Accuracy metrics for all detections

### ☁️ Storage & Management
- **Google Drive integration** - 15GB free storage for videos/images
- **Video recording** - Automatic and manual recording capabilities
- **Playback system** - Timeline controls and video management
- **File organization** - Automatic folder structure by date

### 📊 Analytics & Reporting
- **Daily summary reports** - Automated daily activity summaries
- **Exportable reports** - PDF and CSV export capabilities
- **Motion analytics** - Detailed motion detection statistics
- **Activity timeline** - Chronological event tracking

### 🎨 User Experience
- **Dark mode support** - Toggle between light and dark themes
- **Responsive design** - Mobile and desktop optimized
- **Real-time notifications** - Instant motion alerts
- **Customizable dashboard** - Personalized surveillance overview

## Technology Stack

### Backend
- **Node.js + Express** - RESTful API server
- **Socket.IO** - Real-time communication
- **SQLite** - Local database storage
- **Google Drive API** - Cloud storage integration
- **JWT Authentication** - Secure user sessions

### Frontend
- **React + TypeScript** - Modern web application
- **Material-UI** - Professional UI components
- **Socket.IO Client** - Real-time updates
- **Recharts** - Data visualization
- **React Router** - Client-side routing

## Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/rachellefriloux-alt/guarddog.git
   cd guarddog
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the application**
   ```bash
   npm run dev
   ```

5. **Access the dashboard**
   - Open http://localhost:3000 in your browser
   - Create an account or login
   - Add your cameras and start monitoring!

## Configuration

### Camera Setup
1. Navigate to **Camera Manager**
2. Click **Add Camera**
3. Select camera type (Ring, ESEE, or WiFi)
4. Enter connection details
5. Test connection and save

### Google Drive Integration
1. Go to **Settings**
2. Click **Connect Google Drive**
3. Authorize the application
4. Configure auto-upload preferences

### AI Detection Settings
- Adjust motion sensitivity
- Set confidence thresholds
- Enable/disable specific detection types
- Configure alert preferences

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Cameras
- `GET /api/cameras` - List all cameras
- `POST /api/cameras` - Add new camera
- `PUT /api/cameras/:id` - Update camera
- `DELETE /api/cameras/:id` - Remove camera
- `POST /api/cameras/:id/test` - Test connection

### Recordings
- `GET /api/recordings` - List recordings
- `POST /api/recordings` - Upload recording
- `GET /api/recordings/:id/stream` - Stream video
- `DELETE /api/recordings/:id` - Delete recording

### AI Detection
- `POST /api/ai/detect` - Process detection
- `GET /api/ai/motion-events` - Get motion events
- `GET /api/ai/stats` - Detection statistics

### Reports
- `GET /api/reports/daily-summary` - Daily report
- `GET /api/reports/custom` - Custom period report
- `GET /api/reports/export` - Export data

## Development

### Project Structure
```
guarddog/
├── server/              # Backend API
│   ├── routes/         # API endpoints
│   ├── middleware/     # Auth & validation
│   └── utils/          # Helper functions
├── client/             # React frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── contexts/   # React contexts
│   │   └── services/   # API services
└── uploads/            # File storage
```

### Available Scripts
- `npm run dev` - Start both server and client
- `npm run server` - Start backend only
- `npm run client` - Start frontend only
- `npm run build` - Build for production

## Security Features

- JWT-based authentication
- Rate limiting
- Input validation
- Helmet security headers
- CORS configuration
- Password hashing with bcrypt

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Open a GitHub issue
- Check the documentation
- Review existing issues for solutions

---

**Guarddog** - Keeping your property safe with intelligent AI surveillance.
