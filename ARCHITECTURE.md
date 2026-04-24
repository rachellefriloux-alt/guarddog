# guarddog — Master System Blueprint (v6, free / OneDrive / open-source AI)

> **This file is the master contract for `rachelle-alt/guarddog`.**
>
> The user's explicit goal: *"I want to do as little as possible — hit
> download and it works, and all be $0."* Every choice in this spec is
> filtered through that lens: free tools, no paid AI, no paid storage,
> no GPU required, no cloud servers, runs entirely on a Windows mini-PC.
>
> Code that contradicts this spec should either change the code or
> change this file — not silently disagree. Code-gen assistants (Copilot
> et al.) **MUST** follow this spec; do not invent protocols, do not
> assume RTSP/ONVIF for the EseeCloud C90 cameras, do not bypass the
> desktop-app capture model, do not introduce paid services.

---

## 1. WHAT YOU HAVE

- **4 EseeCloud C90 cameras**
  - P2P only
  - No RTSP
  - No ONVIF
  - Only accessible through the EseeCloud desktop app
- **2 Ring cameras**
  - Can be accessed through `ring-mqtt` (free)
  - Gives you RTSP for free
  - Gives you motion events for free
- **OneDrive**
  - Free storage
  - Syncs automatically
  - Works on Windows
- **Windows mini-PC**
  - Can run everything
  - Can run the EseeCloud app
  - Can run `ring-mqtt`
  - Can run guarddog backend
  - Can run open-source AI locally

## 2. WHAT YOU WANT

- Live view of all 6 cameras
- AI detection
- Event timeline
- Clips saved to OneDrive
- Two-way talk for EseeCloud
- Free AI
- Free storage
- Minimum work
- Copilot builds everything

---

## 3. THE ONLY FREE, SIMPLE, REALISTIC ARCHITECTURE

### 3.1 EseeCloud Cameras (C90)

You **CANNOT** access them directly. So the **ONLY** free way is:

#### Capture the EseeCloud desktop app window
- Use a free screen-capture library
- Split the window into 4 regions
- Each region = one camera
- Save frames to guarddog
- Save clips to OneDrive
- Use UI automation for two-way talk

#### Audio capture
- Use Windows **WASAPI loopback**
- Capture EseeCloud audio
- Save to clip files

#### Two-way talk
- Use **AutoHotkey** or **pywinauto**
- Press the "talk" button in the app
- Use a virtual microphone (**VB-Audio Cable**, free)

This is the **ONLY** free method.

### 3.2 Ring Cameras

Use **`ring-mqtt`** (free, open-source). It gives you:

- RTSP stream
- Motion events
- Doorbell events
- Snapshots
- Device info

guarddog just reads the RTSP stream and events.

### 3.3 AI (FREE, OPEN-SOURCE)

You don't need Sallie-AI.

#### Open-source AI models
- **YOLOv8n** or **YOLOv11n** (free)
- Runs on CPU
- Detects:
  - People
  - Cars
  - Packages
  - Pets

#### How it works
- guarddog sends frames to the AI
- AI returns:
  - "person detected"
  - "car detected"
  - "package detected"
- guarddog saves event
- guarddog saves snapshot to OneDrive

#### No GPU required
- YOLOv8n runs on CPU
- Free
- No API keys
- No cloud fees

### 3.4 Storage (FREE)

Use **OneDrive**:

- Install OneDrive on the mini-PC
- Set guarddog's storage folder to:
  - `C:\Users\<you>\OneDrive\guarddog\clips`
  - `C:\Users\<you>\OneDrive\guarddog\snapshots`
- Everything syncs automatically.

### 3.5 guarddog Backend (FREE)

guarddog does:

- Device list
- Live view URLs
- Event timeline
- Clip list
- Snapshot list
- Two-way talk endpoints
- AI event ingestion
- WebSocket alerts
- Saves files to OneDrive folder

---

## 4. FULL MILESTONES (FOR COPILOT)

### PHASE 1 — Backend Skeleton (Copilot builds this first)

Create NestJS project:

- `/devices`
- `/events`
- `/clips`
- `/snapshots`
- `/auth`
- `/ws/alerts`

Database (**SQLite** or **Postgres**):

- Device table
- Event table
- Clip table
- Snapshot table
- User table

Storage:

- Local folder: `./storage`
- Later moved to OneDrive

> **Current codebase note:** the repo already implements an Express +
> Drizzle backend with most of these surfaces. Migration to NestJS is a
> separate, explicitly-scoped refactor. New work should mirror the
> module layout in §4 so a future migration is mostly a directory move.

### PHASE 2 — EseeCloud Adapter (Stub)

Create module: `/adapters/eseecloud`

Stub functions:

- `getFrame(deviceId)` → return placeholder image
- `startTalk(deviceId)` → log "talk start"
- `stopTalk(deviceId)` → log "talk stop"

Internal API:

- `GET /internal/devices/{id}/frame`

> **Current codebase status:** Phase 2 is implemented. The
> `EseeCloudAdapter` interface lives at
> `server/adapters/eseecloud/eseecloud.adapter.ts`. The stub is
> backed by an in-memory frame buffer (`server/services/frame-store.ts`)
> that the future capture agent (Phase 4) feeds via
> `POST /api/internal/devices/{id}/frame` (header-key auth via
> `ESEE_CAPTURE_AGENT_KEY`). `startTalk` / `stopTalk` throw
> `EseeCloudAdapterNotImplemented` — Phase 4 work.

### PHASE 3 — Ring Adapter

Install `ring-mqtt`:

- Docker container
- Config with Ring login
- Exposes:
  - RTSP URLs
  - MQTT events

guarddog:

- Store RTSP URLs in `Device.stream_url`
- Subscribe to MQTT
- Convert MQTT → `Event` records

### PHASE 4 — Real EseeCloud Capture

#### Video
- Use Windows Graphics Capture API
- Capture EseeCloud window
- Split into 4 regions
- Save frames in memory
- Expose via `/internal/devices/{id}/frame`

#### Audio
- Use **WASAPI loopback**
- Capture EseeCloud audio
- Save to clip files

#### Two-way talk
- Use **AutoHotkey** or **pywinauto**
- Press "talk" button
- Use **VB-Audio Cable** for mic input

### PHASE 5 — AI Integration (FREE)

#### Use YOLOv8n
- Install `ultralytics`
- Load model
- Every X seconds:
  - Pull frame
  - Run detection
  - If person/car/package → create `Event`
  - Save snapshot to OneDrive

guarddog:

- `POST /internal/ai/events`
- Save event
- Push WebSocket alert

### PHASE 6 — Web App

#### Pages
- Login
- Dashboard (6 camera grid)
- Camera view
- Event timeline
- Event details
- Clip playback
- Settings

#### Buttons
- Live
- Mute
- Talk
- Snapshot
- Download
- Fullscreen
- Back
- Refresh

### PHASE 7 — Android App

Same screens + buttons.

### PHASE 8 — Desktop App (Electron)

Wraps Web app.

---

## 5. WHAT COPILOT MUST NEVER DO

- Never try RTSP / ONVIF on EseeCloud
- Never try to connect directly to C90 cameras
- Never assume cloud APIs
- Never require paid AI
- Never require paid storage
- Never require GPU
- Never require Docker for EseeCloud
- Never require cloud servers

## 6. WHAT COPILOT MUST ALWAYS DO

- Use EseeCloud desktop app for C90
- Use screen capture
- Use audio capture
- Use UI automation
- Use `ring-mqtt` for Ring
- Use YOLOv8n for AI
- Use OneDrive folder for storage
- Use NestJS for backend
- Use WebSocket for alerts
- Use HLS / WebRTC for live view

---

## INVARIANTS FOR CONTRIBUTORS AND CODE-GEN ASSISTANTS

- If something is unclear, **prefer stubbing it out with clear `TODO`
  comments rather than inventing behavior.**
- Do NOT "optimize" by bypassing the EseeCloud desktop app or assuming
  direct camera access.
- Do NOT introduce paid services (cloud AI, paid storage, paid
  streaming) — the user's hard requirement is **$0**.
- Do NOT introduce a GPU requirement — YOLOv8n / YOLOv11n on CPU is the
  baseline.
