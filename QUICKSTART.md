# GuardDog Quick Start Guide

Get GuardDog up and running in 5 minutes!

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- (Optional) PostgreSQL for persistent storage

## Installation Steps

### 1. Clone and Install

```bash
git clone https://github.com/rachellefriloux-alt/guarddog.git
cd guarddog
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Open .env in your editor
nano .env  # or: code .env, vim .env, etc.
```

### 3. Minimum Required Configuration

Edit `.env` and set these required values:

```bash
# Generate a secure session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Google OAuth (for login)
GOOGLE_AUTH_CLIENT_ID=your-google-oauth-client-id
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id  # Same as above
```

#### Getting Google OAuth Client ID:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Click "Create Credentials" → "OAuth 2.0 Client ID"
4. Choose "Web application"
5. Add authorized redirect URIs:
   - Development: `http://localhost:5000/auth/google/callback`
   - Production: `https://yourdomain.com/auth/google/callback`
6. Copy the Client ID

### 4. Validate Configuration

```bash
npm run validate-env
```

Fix any errors shown by the validator before proceeding.

### 5. Start Development Server

```bash
npm run dev
```

### 6. Access the Dashboard

Open your browser and go to:
```
http://localhost:5000
```

You should see the GuardDog login page. Click "Sign in with Google" to authenticate.

## Optional Configuration

### OpenAI API (for AI Detection)

If you want AI-powered motion detection:

1. Get an API key from https://platform.openai.com/api-keys
2. Add to `.env`:
   ```bash
   OPENAI_API_KEY=sk-your-key-here
   ```

### PostgreSQL Database (for Persistence)

By default, GuardDog uses in-memory storage. For production, use PostgreSQL:

1. Create a database:
   ```bash
   createdb guarddog
   ```

2. Add to `.env`:
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/guarddog
   ```

3. Push schema:
   ```bash
   npm run db:push
   ```

### Google Drive Integration (for Cloud Storage)

To sync recordings to Google Drive:

1. Create a separate OAuth client in Google Cloud Console
2. Enable Google Drive API
3. Add to `.env`:
   ```bash
   GOOGLE_CLIENT_ID=your-drive-oauth-client-id
   GOOGLE_CLIENT_SECRET=your-drive-oauth-client-secret
   ```

## Adding Cameras

### Via Web Interface

1. Login to GuardDog
2. Click "Add Camera" button
3. Fill in camera details:
   - Name: "Front Door"
   - Type: ring or esee
   - IP Address: 192.168.1.101
   - Stream URL: rtsp://192.168.1.101:554/stream

### Via API

```bash
curl -X POST http://localhost:5000/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Front Door",
    "type": "ring",
    "ipAddress": "192.168.1.101",
    "streamUrl": "rtsp://192.168.1.101:554/stream",
    "location": "front_door",
    "aiDetectionEnabled": true
  }'
```

## Connecting Ring Doorbell

Ring cameras require authentication:

1. Use the Ring authentication endpoint
2. Enter your Ring email and password
3. Complete 2FA verification
4. Credentials are automatically saved to `storage/ring-credentials.json`

## Production Deployment

See [README.md](README.md#-production-deployment) for detailed production deployment instructions.

Quick production build:

```bash
# Ensure environment is configured
npm run validate-env

# Build for production
npm run build

# Start production server
npm start
```

## Troubleshooting

### Cannot login

- Verify `GOOGLE_AUTH_CLIENT_ID` is set correctly
- Check that redirect URI is authorized in Google Cloud Console
- Clear browser cookies and try again

### No cameras showing up

- Check that cameras are on the same network
- Verify RTSP stream URL is correct
- Test stream with:
  ```bash
  ffmpeg -i "rtsp://camera-ip:554/stream" -frames:v 1 test.jpg
  ```

### AI detection not working

- Ensure `OPENAI_API_KEY` is set
- Check API quota: https://platform.openai.com/usage
- Verify you have access to GPT-4 Vision API

### More help

See the [Troubleshooting section](README.md#-troubleshooting) in README.md for detailed solutions.

## Next Steps

- Read [SECURITY.md](SECURITY.md) for security best practices
- Check [README.md](README.md) for full documentation
- Explore the settings page for customization options
- Set up recording retention and cleanup policies
- Configure notifications and alerts

## Getting Help

- [GitHub Issues](https://github.com/rachellefriloux-alt/guarddog/issues)
- Check existing documentation
- Review similar issues

---

**Need more details?** See the complete [README.md](README.md) for comprehensive documentation.
