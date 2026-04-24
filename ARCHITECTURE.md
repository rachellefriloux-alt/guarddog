# guarddog — Master System Blueprint (v7)

> **This file is the master contract for `rachelle-alt/guarddog`.**
>
> The user's explicit goal: a **local, zero-cost, AI-assisted home
> surveillance system** that runs entirely on a Windows mini-PC using
> only free, open-source tools. Every choice in this spec is filtered
> through that lens: free tools, no paid AI, no paid storage, no GPU
> required, no cloud servers.
>
> Code that contradicts this spec should either change the code or
> change this file — not silently disagree. Code-gen assistants (Copilot
> et al.) **MUST** follow this spec; do not invent protocols, do not
> assume RTSP/ONVIF for the EseeCloud C90 cameras, do not bypass the
> desktop-app capture model, do not introduce paid services.

---

## PROJECT

`guarddog` is a local, zero-cost, AI-assisted home surveillance system.

### GOALS

- Run entirely on a Windows mini-PC.
- Use ONLY free, open-source tools and models.
- Use OneDrive as storage (via local sync folder).
- Integrate:
  - 4 EseeCloud C90 Wi-Fi cameras (P2P-only, no RTSP/ONVIF).
  - 2 Ring cameras (via `ring-mqtt`).
- Provide:
  - Real-time live view of all 6 cameras.
  - Audio (listen) and two-way talk for EseeCloud cameras.
  - AI-based detection (people, vehicles, packages, pets) using free open-source models.
  - Event timeline, snapshots, and clips.
  - Web app, Android app, and Desktop app (Electron wrapper).
- Require as little manual setup as possible: download → configure → run.

---

## HARD CONSTRAINTS (MUST FOLLOW)

1. **EseeCloud C90 cameras**:
   - P2P Wi-Fi cameras.
   - **NO** RTSP, **NO** ONVIF, **NO** HTTP API.
   - **ONLY** accessible via the official EseeCloud desktop app.
   - guarddog **MUST NOT** try to connect directly to these cameras.

2. **EseeCloud integration model**:
   - Video comes from **SCREEN CAPTURE** of the EseeCloud desktop app window.
   - Audio comes from **SYSTEM AUDIO CAPTURE** (loopback) of the EseeCloud app.
   - Two-way talk is done via:
     - UI automation (pressing the "talk" button in the app).
     - Virtual microphone routing (VB-Audio Cable or similar).

3. **Ring cameras**:
   - Integrated via `ring-mqtt` (free, open-source).
   - `ring-mqtt` provides:
     - RTSP URLs for live video.
     - MQTT topics for motion/doorbell events.
   - guarddog **MUST** treat Ring cameras as RTSP sources and MQTT event sources.

4. **AI**:
   - **MUST** be free and open-source.
   - **MUST** run locally on CPU (no paid cloud).
   - Use **YOLOv8n** or similar small model for:
     - Person detection
     - Vehicle detection
     - Package detection
     - Pet detection

5. **Storage**:
   - Use OneDrive via local sync folder.
   - Example:
     - Clips:   `C:\Users\<user>\OneDrive\guarddog\clips`
     - Snaps:   `C:\Users\<user>\OneDrive\guarddog\snapshots`

6. **Clients**:
   - Web app, Android app, Desktop app.
   - **MUST** talk **ONLY** to guarddog backend.
   - **MUST NOT** talk directly to Ring or EseeCloud.

---

## TECH STACK

### Backend
- Node.js + TypeScript
- NestJS framework
- Postgres (or SQLite for dev) via TypeORM or Prisma
- WebSocket (NestJS Gateway) for real-time alerts

### AI
- Python service using `ultralytics` (YOLOv8n) or similar
- Communicates with guarddog via HTTP (internal API)

### Adapters
- EseeCloud adapter: Windows-specific screen/audio capture + UI automation
- Ring adapter: `ring-mqtt` + RTSP

### Storage
- Local filesystem under OneDrive sync folder

### Frontend
- Web: React (or Vue) SPA
- Android: Kotlin app
- Desktop: Electron wrapper around Web app

> **Current codebase note:** the repo currently uses **Express + Drizzle**
> on Postgres for the backend, not NestJS + TypeORM/Prisma. Both satisfy
> the spec intent ("Node.js + TypeScript on Postgres"). Migration to
> NestJS is a separate, explicitly-scoped refactor. New work should
> mirror the module layout below so a future migration is mostly a
> directory move.

---

## FOLDER STRUCTURE (BACKEND)

```
/src
  /config
  /modules
    /auth
    /devices
    /events
    /clips
    /snapshots
    /adapters
      /eseecloud
      /ring
  /ws
  app.module.ts
  main.ts

/tests
/migrations
/ARCHITECTURE.md
/README.md
```

---

## DATA MODEL

### Device
- `id` (UUID)
- `name` (string)
- `type`: `"ESEECLOUD"` | `"RING"`
- `model` (string, e.g., `"C90"`, `"Ring Doorbell"`)
- `room` (string)
- `is_online` (boolean)
- `stream_url` (string | null)  *(for Ring or local HLS/WebRTC)*
- `metadata` (JSON)

### Event
- `id` (UUID)
- `device_id` (UUID)
- `type` (string)  *(e.g., `"MOTION"`, `"RING_DING"`, `"AI_PERSON"`, `"AI_VEHICLE"`, `"AI_PACKAGE"`)*
- `timestamp` (ISO datetime)
- `metadata` (JSON)  *(e.g., bounding boxes, confidence, etc.)*

### Clip
- `id` (UUID)
- `device_id` (UUID)
- `event_id` (UUID | null)
- `file_path` (string)  *(path under OneDrive folder)*
- `start_time` (ISO datetime)
- `end_time` (ISO datetime)
- `duration_seconds` (number)

### Snapshot
- `id` (UUID)
- `device_id` (UUID)
- `event_id` (UUID | null)
- `file_path` (string)  *(path under OneDrive folder)*
- `timestamp` (ISO datetime)

### User
- `id` (UUID)
- `email` (string)
- `password_hash` (string)

---

## PUBLIC API (FOR CLIENTS)

Base: `/api`

### Auth
- `POST /auth/login`
  - Body: `{ email, password }`
  - Returns: `{ token, user }`
- `POST /auth/logout`

### Devices
- `GET /devices`
- `GET /devices/{id}`
- `GET /devices/{id}/live`
  - Returns: `{ stream_url, type }`  *(HLS or WebRTC URL)*

### Events
- `GET /events`
  - Query: `device_id?`, `type?`, `from?`, `to?`, `limit?`, `offset?`
- `GET /events/{id}`

### Clips
- `GET /clips/{id}`
- `GET /clips/{id}/download`

### Snapshots
- `GET /snapshots/{id}`

### Two-way talk (EseeCloud only)
- `POST /devices/{id}/talk/start`
- `POST /devices/{id}/talk/stop`

### WebSocket
- `/ws/alerts`
  - Pushes:
    - Ring motion/ding events
    - AI events (person, vehicle, package, pet)
    - System alerts

---

## INTERNAL API (FOR ADAPTERS + AI)

Base: `/internal`

### Frames
- `GET /internal/devices/{id}/frame`
  - Returns latest JPEG/PNG frame for that device.
- `POST /internal/devices/{id}/frame` *(capture-agent ingest, header-key auth)*

### AI events
- `POST /internal/ai/events`
  - Body: `{ device_id, type, timestamp, confidence, summary?, metadata? }`

### Adapter registration (optional)
- `POST /internal/adapters/register`
  - Body: `{ device_id, adapter_type, stream_url?, capabilities }`

> All `/internal/*` paths are mounted under the existing `/api` prefix
> in this codebase, so the actual URLs are `/api/internal/...`. The
> capture-agent ingest endpoint requires a shared-secret header
> (`x-capture-agent-key` matching `ESEE_CAPTURE_AGENT_KEY`); read
> endpoints use the standard session auth.

---

## ESEE CLOUD ADAPTER (DETAIL)

### Purpose
Provide frames, audio, and two-way talk for 4 C90 cameras via the EseeCloud desktop app.

### Implementation outline
- Language: can be Node.js (native modules) or Python; guarddog talks to it via HTTP/IPC.
- Use Windows Graphics Capture API (or similar) to:
  - Capture the EseeCloud window.
  - Define 4 regions (one per camera).
  - For each region:
    - Continuously capture frames (e.g., 10–15 FPS).
    - Store latest frame in memory.
- Expose:
  - `GET /internal/devices/{id}/frame` → returns latest frame for that camera.

### Audio
- Use **WASAPI loopback capture** to capture EseeCloud app audio.
- Optionally mux audio + video into an HLS/WebRTC stream via `ffmpeg`.

### Two-way talk
- Use UI automation (**AutoHotkey**, **pywinauto**, or **WinAppDriver**) to:
  - Focus EseeCloud window.
  - Select the correct camera tile.
  - Press the "talk" button on start.
  - Release the "talk" button on stop.
- Use a virtual microphone (**VB-Audio Cable**):
  - guarddog receives mic audio from client.
  - Sends it to the virtual mic.
  - EseeCloud app uses that virtual mic as input.

### guarddog MUST
- Treat EseeCloud devices as:
  - `type`: `"ESEECLOUD"`
  - `stream_url`: local HLS/WebRTC URL (if available) or `null`.
- Use `/internal/devices/{id}/frame` for AI and snapshots.

> **Current codebase status (Phase 2):** `EseeCloudAdapter` interface
> lives at `server/adapters/eseecloud/eseecloud.adapter.ts`
> (`getFrame`, `startTalk`, `stopTalk`). The stub is backed by an
> in-memory frame buffer (`server/services/frame-store.ts`) that the
> future capture agent (Phase 4) feeds via
> `POST /api/internal/devices/{id}/frame` (header-key auth via
> `ESEE_CAPTURE_AGENT_KEY`). `startTalk` / `stopTalk` throw
> `EseeCloudAdapterNotImplemented` — Phase 4 work.

---

## RING ADAPTER (DETAIL)

### Use `ring-mqtt`
- Runs in Docker on the mini-PC.
- Logs into Ring account.
- Provides:
  - RTSP URLs for each Ring camera.
  - MQTT topics for motion/ding events.

### guarddog
- Stores RTSP URLs in `Device.stream_url` for type `"RING"`.
- Uses `ffmpeg` or a media server to convert RTSP → HLS/WebRTC.
- Subscribes to MQTT topics:
  - On motion/ding:
    - Create `Event` record.
    - Push WebSocket alert.

---

## AI SERVICE (FREE, OPEN-SOURCE)

Separate **Python** service (not in this repo, but guarddog must support it).

### Model
- **YOLOv8n** (`ultralytics`) or similar small model.
- Runs on CPU.

### Flow
- For each camera (configurable interval, e.g., every 1–2 seconds):
  - `GET /internal/devices/{id}/frame`
  - Run detection:
    - person, car, package, dog/cat
  - If detection above threshold:
    - `POST /internal/ai/events` with:
      - `device_id`
      - `type` (e.g., `"AI_PERSON"`, `"AI_VEHICLE"`, `"AI_PACKAGE"`, `"AI_PET"`)
      - `timestamp`
      - `confidence`
      - `metadata` (bounding boxes, labels)
- guarddog:
  - Saves `Event`.
  - Optionally triggers snapshot:
    - Save frame to OneDrive snapshots folder.
    - Link `Snapshot` to `Event`.
  - Push WebSocket alert.

---

## STORAGE (ONEDRIVE)

On Windows mini-PC:

- Install OneDrive.
- Create folders:
  - `C:\Users\<user>\OneDrive\guarddog\clips`
  - `C:\Users\<user>\OneDrive\guarddog\snapshots`

guarddog:

- When saving a clip:
  - Writes file under clips folder.
  - Stores relative path in `Clip.file_path`.
- When saving a snapshot:
  - Writes file under snapshots folder.
  - Stores relative path in `Snapshot.file_path`.

OneDrive syncs everything automatically to the cloud.

---

## FRONTEND (WEB APP)

### Tech
- React (preferred) + TypeScript.

### Screens

#### 1. Login
- Fields: email, password
- Button: "Log in"
- Calls: `POST /auth/login`

#### 2. Dashboard (6-camera grid)
- Shows 6 tiles (4 EseeCloud, 2 Ring).
- Each tile:
  - Live thumbnail (HLS/WebRTC).
  - Device name.
  - Status (online/offline).
  - Tap/click → open Camera View.

#### 3. Camera View
- Full video player (HLS/WebRTC).
- Live audio.
- Buttons:
  - "Back"
  - "Mute/Unmute"
  - "Talk" (press-and-hold or toggle)
  - "Snapshot"
  - "Events"
  - "Fullscreen"

Behavior:
- "Talk" → `POST /devices/{id}/talk/start`, then `/stop`.
- "Snapshot" → calls backend to capture frame and save `Snapshot`.

#### 4. Event Timeline
- List of events (most recent first).
- Filters:
  - Device
  - Type
  - Time range
- Each event:
  - Icon (person, car, package, ring bell, etc.)
  - Time
  - Device name
- Click → Event Details.

#### 5. Event Details
- Shows:
  - Event info
  - Snapshot (if available)
  - Link to clip (if available)
- Buttons:
  - "Play clip"
  - "Open camera"

#### 6. Settings
- Configure:
  - Device names/rooms
  - AI sensitivity (thresholds)
  - Recording rules (e.g., record on `AI_PERSON`)
  - OneDrive path (optional config display)

### Desktop app
- Electron wrapper around Web app.

### Android app
- Same screens and buttons, using native UI.
- Uses same REST + WebSocket API.

---

## MILESTONES (FOR COPILOT)

### PHASE 1: Backend core
- Set up NestJS + TypeScript.
- Configure DB (SQLite or Postgres).
- Implement:
  - `Device`, `Event`, `Clip`, `Snapshot`, `User` entities.
  - `/devices`, `/events`, `/clips`, `/snapshots`, `/auth` endpoints.
- Implement WebSocket `/ws/alerts` (stub).

### PHASE 2: EseeCloud adapter (stub)
- Create `/adapters/eseecloud` module.
- Implement stub `EseecloudAdapter`:
  - `getFrame(deviceId)`: returns placeholder image.
  - `startTalk(deviceId)`: logs.
  - `stopTalk(deviceId)`: logs.
- Implement `GET /internal/devices/{id}/frame` using stub.

### PHASE 3: Ring adapter
- Add `/adapters/ring` module.
- Define `RingAdapter` interface.
- Implement integration with `ring-mqtt` (config only, no heavy logic if needed).
- Store RTSP URLs in `Device.stream_url`.
- Stub MQTT subscription.

### PHASE 4: Real EseeCloud capture
- Replace stub `EseecloudAdapter` with real Windows screen capture + region mapping.
- Implement real `GET /internal/devices/{id}/frame`.
- Add basic `ffmpeg` pipeline to expose HLS/WebRTC streams for EseeCloud cameras.

### PHASE 5: AI integration
- Implement `/internal/ai/events` endpoint.
- Add logic to create `Event`s + `Snapshot`s from AI events.
- Document how external AI service should call `/internal/devices/{id}/frame` and `/internal/ai/events`.

### PHASE 6: Web app
- Build React app with screens described above.
- Integrate:
  - `/devices`
  - `/devices/{id}/live`
  - `/events`
  - `/clips`
  - `/snapshots`
  - `/ws/alerts`
  - `/devices/{id}/talk/start/stop`

### PHASE 7: Polish + Android + Electron
- Add Android client.
- Add Electron wrapper.
- Improve error handling, health checks, and configuration.

---

## CODING RULES FOR COPILOT

- DO NOT assume RTSP/ONVIF for EseeCloud C90.
- DO NOT try to connect directly to C90 cameras.
- ALWAYS route EseeCloud through the desktop app via the EseeCloud adapter.
- ALWAYS treat Ring cameras via `ring-mqtt` (RTSP + MQTT).
- ALWAYS use free, open-source AI (YOLOv8n or similar) and local CPU.
- ALWAYS use OneDrive via local folder for storage.
- Use NestJS patterns, TypeScript strict mode, and dependency injection.
- If something is unclear, **create a stub with `TODO` comments instead of inventing behavior**.
