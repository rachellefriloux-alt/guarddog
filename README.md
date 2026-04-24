# GuardDog 🛡️

GuardDog is a **local, zero‑cost home security system** that runs on a **Windows mini‑PC**, unifies your **Ring** and **EseeCloud C90** cameras, uses **free open‑source AI**, and stores clips/snapshots in **OneDrive**.

- 4× **EseeCloud C90** Wi‑Fi cameras (P2P‑only, no RTSP/ONVIF)
- 2× **Ring** cameras (via `ring-mqtt`)
- **Single‑cam and multi‑cam live view**
- **Two‑way talk** for EseeCloud cameras (via desktop app automation)
- **AI detection** (people, vehicles, packages, pets) using local YOLO
- **Event timeline, clips, snapshots**
- **Web, Desktop (Electron), and Android apps**

Everything is **local**, **private**, and **$0** to run.

---

## 🎯 Goals

- 💸 **$0 runtime cost** — no OpenAI, no Google Cloud, no paid APIs
- 🖥️ Run entirely on a **Windows mini‑PC**
- 📹 Real‑time **single‑cam and multi‑cam** views
- 🧠 Free, local **open‑source AI** (YOLO on CPU)
- ☁️ Use **OneDrive** (via local sync folder) for clips and snapshots
- 📱 Provide a **web dashboard**, **desktop app**, and **Android app**

---

## 🚫 Hard Constraints

### EseeCloud C90 cameras

- P2P Wi‑Fi only
- **No RTSP, no ONVIF, no HTTP API**
- Only accessible via the **EseeCloud desktop app** on Windows
- GuardDog must **NOT** try to connect directly to these cameras

**Integration model:**

- Video: **screen capture** of the EseeCloud desktop app window
- Audio: **system audio capture** (WASAPI loopback)
- Two‑way talk:
  - UI automation to press/release the “talk” button in the app
  - Virtual microphone (e.g., VB‑Audio Cable) for sending mic audio into the app

### Ring cameras

- Integrated via **`ring-mqtt`** (free, open‑source)
- `ring-mqtt` provides:
  - RTSP URLs for live video
  - MQTT topics for motion/doorbell events
- GuardDog treats Ring cameras as **RTSP + MQTT** sources

### AI

- Must be **free**, **local**, **open‑source**
- Runs on **CPU** (no GPU required)
- YOLO‑style model (e.g., YOLOv8n) for:
  - Person, vehicle, package, pet detection

### Storage

- Use **OneDrive** via local sync folder, e.g.:

  - `C:\Users\<user>\OneDrive\guarddog\clips`
  - `C:\Users\<user>\OneDrive\guarddog\snapshots`

### Clients

- Web app, Android app, Desktop (Electron)
- Must talk **only** to GuardDog’s HTTP + WebSocket API
- Never talk directly to Ring or EseeCloud

---

## 🧱 Tech Stack

- **Backend:** Node.js, TypeScript, NestJS
- **Database:** SQLite or Postgres via ORM (TypeORM/Prisma)
- **Realtime:** WebSocket (NestJS Gateway) for alerts
- **AI service:** separate Python process using YOLO (ultralytics) on CPU
- **Adapters:**
  - EseeCloud adapter: Windows screen/audio capture + UI automation
  - Ring adapter: `ring-mqtt` + RTSP + MQTT
- **Storage:** local filesystem under OneDrive sync folder
- **Frontend:** React (Web), Electron (Desktop wrapper), Android (Kotlin/Compose)

---

## 🏗️ Architecture Overview

### Backend (this repo)

- REST API + WebSocket
- Device registry (Ring + EseeCloud)
- Events, clips, snapshots, users
- Integrates with:
  - **EseeCloud adapter** (screen/audio/talk)
  - **Ring adapter** (RTSP + MQTT)
  - **AI service** (YOLO)

### EseeCloud adapter

- Captures the EseeCloud desktop app window
- Splits into 4 regions → 4 C90 cameras
- Captures audio via loopback
- Automates two‑way talk via UI automation
- Exposes:

  - `GET /internal/devices/{id}/frame` → latest JPEG/PNG frame

### Ring adapter

- Uses `ring-mqtt` to:
  - Provide RTSP URLs for Ring cameras
  - Emit motion/doorbell events via MQTT
- GuardDog:
  - Stores RTSP URLs in `Device.stream_url`
  - Subscribes to MQTT and creates `Event` records

### AI service (Python)

- Periodically pulls frames from GuardDog:

  - `GET /internal/devices/{id}/frame`

- Runs YOLO detection
- Posts AI events back:

  - `POST /internal/ai/events`

### Storage

- GuardDog writes clips/snapshots into OneDrive‑synced folders
- Paths stored in DB

---

## 📦 Data Model (simplified)

**Device**

- `id` (UUID)
- `name` (string)
- `type` (`"ESEECLOUD"` | `"RING"`)
- `model` (string)
- `room` (string)
- `is_online` (boolean)
- `stream_url` (string | null)
- `metadata` (JSON)

**Event**

- `id` (UUID)
- `device_id` (UUID)
- `type` (e.g. `"MOTION"`, `"RING_DING"`, `"AI_PERSON"`, `"AI_VEHICLE"`, `"AI_PACKAGE"`, `"AI_PET"`)
- `timestamp` (ISO datetime)
- `metadata` (JSON)

**Clip**

- `id` (UUID)
- `device_id` (UUID)
- `event_id` (UUID | null)
- `file_path` (string) — path under OneDrive folder
- `start_time` (ISO datetime)
- `end_time` (ISO datetime)
- `duration_seconds` (number)

**Snapshot**

- `id` (UUID)
- `device_id` (UUID)
- `event_id` (UUID | null)
- `file_path` (string)
- `timestamp` (ISO datetime)

**User**

- `id` (UUID)
- `email` (string)
- `password_hash` (string)

---

## 🔌 Public API (for Web / Desktop / Android)

Base: `/api`

- `POST /auth/login`
- `GET /devices`
- `GET /devices/:id`
- `GET /devices/:id/live` → `{ stream_url, type }`
- `GET /events` (filters: device, type, time range)
- `GET /events/:id`
- `GET /clips/:id`
- `GET /clips/:id/download`
- `GET /snapshots/:id`
- `POST /devices/:id/talk/start` (EseeCloud only)
- `POST /devices/:id/talk/stop`

**WebSocket**

- `/ws/alerts`
  - Pushes Ring motion/ding, AI events, and system alerts

---

## 🔧 Internal API (for adapters + AI)

Base: `/internal`

- `GET /internal/devices/:id/frame` → latest JPEG/PNG frame
- `POST /internal/ai/events` → AI event ingestion
- `POST /internal/adapters/register` (optional)

---

## 🖥️ UI: Single‑Cam & Multi‑Cam Views

### Multi‑Cam Dashboard

- Grid layout (2×2, 3×3, 4×4; auto‑fit 6 cameras)
- Each tile shows:
  - Live video thumbnail
  - Device name
  - Online/offline status
  - Motion/AI indicator
- Click/tap tile → open Single‑Cam View

### Single‑Cam View

- Full‑screen live video
- Live audio
- Controls:
  - Back to grid
  - Mute / Unmute
  - Talk (EseeCloud only)
  - Snapshot
  - Record
  - Events (open timeline filtered to this camera)
  - Fullscreen

---

## 🛠️ Milestones (for Copilot)

**Phase 1 – Backend core**

- Set up NestJS + DB
- Implement entities + basic CRUD for:
  - Devices, Events, Clips, Snapshots, Users
- Implement `/devices`, `/events`, `/clips`, `/snapshots`, `/auth`
- Implement `/ws/alerts` (stub)

**Phase 2 – EseeCloud adapter (stub)**

- Add `adapters/eseecloud` module
- Stub:
  - `getFrame(deviceId)` → placeholder image
  - `startTalk(deviceId)` / `stopTalk(deviceId)` → log only
- Wire `GET /internal/devices/:id/frame` to stub

**Phase 3 – Ring adapter**

- Add `adapters/ring` module
- Integrate with `ring-mqtt`:
  - Store RTSP URLs in `Device.stream_url`
  - Stub MQTT subscription → later create Events

**Phase 4 – Real EseeCloud capture**

- Implement Windows screen capture of EseeCloud window
- Map 4 regions → 4 devices
- Implement real `getFrame(deviceId)`
- Add ffmpeg pipeline to expose HLS/WebRTC streams

**Phase 5 – AI integration**

- Implement `/internal/ai/events`
- Document AI service contract:
  - Pull frames via `/internal/devices/:id/frame`
  - Push events via `/internal/ai/events`
- On AI event:
  - Create Event
  - Optionally save Snapshot

**Phase 6 – Web app**

- Build React app with:
  - Multi‑cam dashboard
  - Single‑cam view
  - Event timeline
  - Clip playback
  - Talk button

**Phase 7 – Desktop + Android**

- Electron wrapper for Web app (Windows installer)
- Android app using same API

---

## 🧭 Rules for Copilot

- **Never** assume RTSP/ONVIF for EseeCloud C90
- **Never** talk directly to C90 cameras
- **Always** route EseeCloud through the desktop app via the EseeCloud adapter
- **Always** use `ring-mqtt` for Ring cameras
- **Always** assume AI is local, free, and CPU‑based
- **Always** store clips/snapshots under the OneDrive folder
- If something is unclear, create a stub with `TODO` instead of inventing behavior

---

For the full, authoritative design (data model, adapters, milestones, validation rules), see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
