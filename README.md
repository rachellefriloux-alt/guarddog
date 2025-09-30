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
- **Dark Mode Support**: Complete dark/light theme with persistence
- **Responsive Design**: Modern UI built with React and Tailwind CSS
- **Export Reports**: Daily summary reports in HTML/CSV formats

## 🏗️ Architecture

- **Backend**: Node.js/Express server with TypeScript
- **Frontend**: React + TypeScript with Vite
- **Database**: Drizzle ORM with PostgreSQL (in-memory fallback)
- **Real-time**: WebSocket server for live updates
- **Storage**: Cloud file management with upload/download capabilities
- **Authentication**: Session-based authentication system

## 🚀 Getting Started

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

## 📋 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server  
- `npm run check` - TypeScript type checking
- `npm run db:push` - Push database schema changes

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

## 📞 Support

For support and questions:

- Create an issue on GitHub
- Check the documentation
- Review existing issues and discussions

---

Built with ❤️ for home security and surveillance needs.
