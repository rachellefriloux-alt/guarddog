# EseeCloud Adapter

Purpose: Capture the EseeCloud desktop app window on Windows, split into 4 camera regions, expose latest JPEG frames for the backend, provide talk start/stop hooks, and optionally produce HLS segments for low-latency viewing.

This adapter is intentionally split into:
- **capture.py** — window capture + region cropping + write latest JPEGs
- **talk.py** — UI automation stubs for hold-to-talk
- **streamer.py** — ffmpeg HLS pipeline helper
- **server.py** — small HTTP server to serve frames to backend `/internal/devices/:id/frame`

Notes:
- The included capture implementation uses a safe fallback (screenshot) for development. Replace with Windows Graphics Capture (winrt) for production.
- For two-way talk, install a virtual audio cable (VB-Audio Cable) and configure the system to route adapter mic output into the EseeCloud app.

## Run (development)

```powershell
cd eseecloud-adapter
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Start capture + HTTP server (in two terminals or background processes)
python capture.py
python server.py
```

## Verify

```bash
curl http://localhost:6000/internal/devices/cam1/frame --output cam1.jpg
curl -X POST http://localhost:6000/internal/devices/cam1/talk/start
curl -X POST http://localhost:6000/internal/devices/cam1/talk/stop
```

## Backend integration

The NestJS backend's `EseecloudAdapter` (see `backend/src/adapters/eseecloud/eseecloud.adapter.ts`) calls this server over HTTP. Set `ESEECLOUD_ADAPTER_BASE` if the adapter runs on a non-default host/port (default `http://localhost:6000`).
