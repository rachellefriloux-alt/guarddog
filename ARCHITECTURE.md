# guarddog — Master System Blueprint

> **This file is the master contract for `rachelle-alt/guarddog`.** Code
> that contradicts it should either change the code or change this file —
> not silently disagree. Code-gen assistants (Copilot et al.) **MUST**
> follow this spec; do not invent protocols, do not assume RTSP/ONVIF for
> the EseeCloud C90 cameras, do not bypass the desktop-app capture model.

---

## 0. SYSTEM SUMMARY

`guarddog` is a **full-stack home security platform** that:

- Runs on a **Windows mini-PC**
- Integrates **4 EseeCloud C90 cameras** (P2P-only)
- Integrates **2 Ring cameras**
- Provides:
  - Live view
  - Audio
  - Two-way talk
  - Event timeline
  - Clips
  - Snapshots
  - Alerts
  - AI analysis
- Serves:
  - Web app
  - Android app
  - Desktop app (Electron)

`guarddog` is the **backend brain**.
EseeCloud desktop app is the **camera gateway**.
Ring API / `ring-mqtt` is the **Ring gateway**.
Sallie-AI (separate repo) is the **AI brain**.

---

## 1. GLOBAL MILESTONES (TOP-LEVEL ROADMAP)

### **PHASE 1 — Backend foundation**
- Create NestJS backend
- Set up Postgres
- Implement:
  - Device model
  - Event model
  - Clip model
  - Snapshot model
  - User model
- Implement:
  - `/devices`
  - `/events`
  - `/clips`
  - `/snapshots`
  - `/auth`
- Implement WebSocket `/ws/alerts`

### **PHASE 2 — EseeCloud adapter (stub → real)**
- Create adapter module
- Stub:
  - `getFrame()`
  - `startTalk()`
  - `stopTalk()`
- Implement internal API:
  - `/internal/devices/{id}/frame`
- Later replace stub with:
  - Real screen capture
  - Real audio capture
  - Real UI automation

### **PHASE 3 — Ring adapter**
- Choose:
  - Official Ring API OR
  - `ring-mqtt`
- Implement:
  - Device discovery
  - Live stream URLs
  - Motion / ding events
- Normalize into guarddog events

### **PHASE 4 — Media pipeline**
- Convert:
  - EseeCloud frames → HLS / WebRTC
  - Ring RTSP / WebRTC → HLS / WebRTC
- Provide:
  - `/devices/{id}/live`

### **PHASE 5 — AI integration**
- Expose:
  - `/internal/devices/{id}/frame`
- Sallie-AI:
  - Pulls frames
  - Detects events
  - Pushes:
    - `/internal/ai/events`

### **PHASE 6 — Clients**
- Web app
- Android app
- Desktop app (Electron)
- Features:
  - Live grid
  - Single camera view
  - Event timeline
  - Clip playback
  - Two-way talk
  - Settings

### **PHASE 7 — Polish**
- User roles
- Notifications
- Recording rules
- Health checks
- Logs

---

## 2. BACKEND (GUARDDOG) — FULL SPEC

### 2.1 Tech stack
- Node.js
- TypeScript
- NestJS
- TypeORM or Prisma
- Postgres
- WebSocket gateway
- Local storage for clips / snapshots

> **Current codebase note:** this repo currently uses **Express** (not
> NestJS) and **Drizzle ORM** (not TypeORM/Prisma) on Postgres. Both
> satisfy the spec intent ("Node.js + TypeScript on Postgres").
> Conversion to NestJS + TypeORM is a separate, explicitly-scoped
> refactor. **New work should follow the modular layout in §2.2 so a
> future migration is mostly a directory move.**

### 2.2 Folder structure

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
```

### 2.3 Database schema

#### Device
- `id`
- `name`
- `type`: `ESEECLOUD` | `RING`
- `model`
- `room`
- `is_online`
- `stream_url`
- `metadata` (JSON)

#### Event
- `id`
- `device_id`
- `type`
- `timestamp`
- `metadata` (JSON)

#### Clip
- `id`
- `device_id`
- `event_id`
- `file_path`
- `start_time`
- `end_time`

#### Snapshot
- `id`
- `device_id`
- `event_id`
- `file_path`
- `timestamp`

#### User
- `id`
- `email`
- `password_hash`

### 2.4 Public API

#### Devices
- `GET /devices`
- `GET /devices/{id}`
- `GET /devices/{id}/live`

#### Events
- `GET /events`
- `GET /events/{id}`

#### Clips
- `GET /clips/{id}`
- `GET /clips/{id}/download`

#### Snapshots
- `GET /snapshots/{id}`

#### Two-way talk
- `POST /devices/{id}/talk/start`
- `POST /devices/{id}/talk/stop`

#### WebSocket
- `/ws/alerts`

### 2.5 Internal API (for adapters + AI)

#### Frames
- `GET /internal/devices/{id}/frame`
- `POST /internal/devices/{id}/frame` *(capture-agent ingest, header-key auth)*

#### AI events
- `POST /internal/ai/events`

#### Adapter registration
- `POST /internal/adapters/register`

> All `/internal/*` paths are mounted under the existing `/api` prefix in
> this codebase, so the actual URLs are `/api/internal/...`. The
> capture-agent ingest endpoint requires a shared-secret header
> (`x-capture-agent-key` matching `ESEE_CAPTURE_AGENT_KEY`); read
> endpoints use the standard session auth.

---

## 3. ESEECLOUD ADAPTER — FULL HOW-TO

### 3.1 What it does
- Captures video from EseeCloud desktop app
- Captures audio
- Automates UI for:
  - Selecting camera
  - Two-way talk
  - PTZ (if available)

### 3.2 Video capture
- Use **Windows Graphics Capture API**
- Capture EseeCloud window
- Define 4 regions:
  - `cam1`: x1, y1, w, h
  - `cam2`: x2, y2, w, h
  - `cam3`: x3, y3, w, h
  - `cam4`: x4, y4, w, h
- For each region:
  - Extract frame
  - Store latest frame in memory
  - Expose via `/internal/devices/{id}/frame`

### 3.3 Audio capture
- Use **WASAPI loopback capture**
- Capture EseeCloud app audio
- Mux into HLS / WebRTC stream

### 3.4 Two-way talk
- Use UI automation:
  - `pywinauto`
  - AutoHotkey
  - WinAppDriver
- Steps:
  - Focus EseeCloud window
  - Select camera tile
  - Press "talk" button
  - Release on stop

### 3.5 Virtual microphone
- Install virtual audio cable
- guarddog receives mic audio from client
- Sends to virtual mic
- EseeCloud app uses virtual mic

### 3.6 Hard constraints (do not ignore)
- **EseeCloud C90 cameras**:
  - Model: **C90**
  - Firmware: **5.6.78.0**
  - MAC prefix: **`A4:86:DB`**
  - P2P-only Wi-Fi cameras.
  - DO NOT expose RTSP or ONVIF.
  - DO NOT have a usable HTTP / RTSP API.
  - ONLY accessible via the official EseeCloud desktop app.
- `guarddog` MUST NOT:
  - Connect directly to C90 cameras via RTSP / ONVIF / HTTP.
  - Invent protocols or assume they behave like normal IP cameras.
  - Depend on direct LAN access to the C90 cameras.

---

## 4. RING ADAPTER — FULL HOW-TO

### Option A — Official Ring API
- OAuth login
- Device discovery
- WebRTC live view
- Webhooks for events

### Option B — `ring-mqtt` (recommended)
- Run `ring-mqtt` in Docker
- It provides:
  - RTSP URLs
  - MQTT events
- guarddog:
  - Stores RTSP URLs
  - Subscribes to MQTT
  - Converts to `Event` records

---

## 5. MEDIA PIPELINE — FULL HOW-TO

### For EseeCloud
- Frames → `ffmpeg` → HLS / WebRTC
- Audio → WASAPI → `ffmpeg` → mux

### For Ring
- RTSP → `ffmpeg` → HLS / WebRTC

### guarddog returns:
- `/devices/{id}/live` → HLS / WebRTC URL

---

## 6. AI INTEGRATION — FULL HOW-TO

Sallie-AI (separate repo) does:

- Pull frames:
  - `GET /internal/devices/{id}/frame`
- Run detection:
  - Person
  - Vehicle
  - Package
  - Pet
- Push events:
  - `POST /internal/ai/events`

`guarddog` stores them as `Event` records.

---

## 7. CLIENT APPS — FULL SPEC

### 7.1 Web App (React or Vue)

#### Screens
- Login
- Dashboard (grid of 6 cameras)
- Single camera view
- Event timeline
- Event details
- Clip playback
- Settings

#### Buttons
- Live view
- Mute / unmute
- Start talk
- Stop talk
- Take snapshot
- Download clip
- Refresh
- Switch camera
- View events
- Logout

### 7.2 Android App (Kotlin)

#### Screens
Same as Web.

#### Buttons
Same as Web + mobile gestures.

### 7.3 Desktop App (Electron)

- Wraps Web app
- Adds:
  - Local notifications
  - Auto-start
  - System tray

---

## 8. UI FLOWS — FULL DETAIL

### Live View
1. User selects camera
2. App requests `/devices/{id}/live`
3. Player loads HLS / WebRTC
4. App shows:
   - Video
   - Audio
   - Buttons:
     - Talk
     - Snapshot
     - Events
     - Fullscreen

### Two-way talk
1. User presses "Talk"
2. App sends:
   - `POST /devices/{id}/talk/start`
3. guarddog:
   - Calls EseeCloud adapter
   - Presses talk button
4. User releases
5. App sends:
   - `POST /devices/{id}/talk/stop`

### Event timeline
- `GET /events?device_id=...`
- Display list
- Tap → event details

### Clip playback
- `GET /clips/{id}`
- Load video player

---

## 9. FINAL CODING RULES

- DO NOT assume RTSP / ONVIF for EseeCloud.
- DO NOT talk directly to C90 cameras.
- ALWAYS use EseeCloud desktop app + adapter.
- KEEP guarddog modular.
- USE NestJS patterns.
- USE TypeScript strict mode.
- USE dependency injection.
- USE Postgres.
- USE WebSocket for alerts.
- USE internal APIs for adapters + AI.
- All clients (Web / Android / Desktop) MUST talk ONLY to guarddog. They DO NOT talk directly to Ring or EseeCloud.
- If something is unclear, **prefer stubbing it out with clear `TODO` comments rather than inventing behavior**.
