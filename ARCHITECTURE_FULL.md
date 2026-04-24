# Full System Blueprint — All Layers

This document is the authoritative, layered implementation spec for GuardDog. It complements `README.md` (high-level constraints) and `ARCHITECTURE.md` (master contract) with concrete folder trees, starter files, and exact commands so Copilot can scaffold working artifacts without guessing.

GuardDog is a **local, zero-cost** home security system for **4× EseeCloud C90** (P2P-only) and **2× Ring** (via `ring-mqtt`) cameras, with **local YOLO** AI and **OneDrive** storage. See `README.md` for hard constraints (no RTSP/ONVIF for EseeCloud, no paid APIs, etc.).

---

## 1. Backend NestJS Skeleton

**Purpose**: full NestJS app with Devices, Events, Clips, Snapshots, Auth, and WebSocket gateway. Use SQLite for local installs; Postgres optional.

### Folder tree

```
backend/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── index.ts
│   ├── entities/
│   │   ├── device.entity.ts
│   │   ├── event.entity.ts
│   │   ├── clip.entity.ts
│   │   └── snapshot.entity.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── devices/
│   │   ├── events/
│   │   ├── clips/
│   │   └── snapshots/
│   ├── adapters/
│   │   ├── eseecloud/
│   │   │   └── eseecloud.adapter.ts
│   │   └── ring/
│   │       └── ring.adapter.ts
│   ├── internal/
│   │   └── internal.controller.ts
│   └── ws/
│       └── alerts.gateway.ts
```

### package.json

```json
{
  "name": "guarddog-backend",
  "version": "0.1.0",
  "scripts": {
    "start": "ts-node -r tsconfig-paths/register src/main.ts",
    "build": "tsc -p tsconfig.json",
    "dev": "nodemon --watch 'src/**/*.ts' --exec 'ts-node' src/main.ts",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/websockets": "^10.0.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.0",
    "typeorm": "^0.3.17",
    "sqlite3": "^5.1.6",
    "axios": "^1.4.0"
  },
  "devDependencies": {
    "ts-node": "^10.9.1",
    "typescript": "^5.1.6",
    "nodemon": "^2.0.22",
    "jest": "^29.6.0"
  }
}
```

### src/main.ts

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as process from 'process';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
  await app.listen(port);
  console.log(`GuardDog backend listening on ${port}`);
}
bootstrap();
```

### src/app.module.ts

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { Event } from './entities/event.entity';
import { Clip } from './entities/clip.entity';
import { Snapshot } from './entities/snapshot.entity';
import { DevicesModule } from './modules/devices/devices.module';
import { EventsModule } from './modules/events/events.module';
import { ClipsModule } from './modules/clips/clips.module';
import { SnapshotsModule } from './modules/snapshots/snapshots.module';
import { AlertsGateway } from './ws/alerts.gateway';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_URL || 'guarddog.db',
      entities: [Device, Event, Clip, Snapshot],
      synchronize: true
    }),
    DevicesModule,
    EventsModule,
    ClipsModule,
    SnapshotsModule
  ],
  providers: [AlertsGateway]
})
export class AppModule {}
```

### src/entities/device.entity.ts

```ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  type: 'ESEECLOUD' | 'RING';

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  room: string;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ nullable: true })
  streamUrl: string;

  @Column('simple-json', { nullable: true })
  metadata: any;
}
```

### src/internal/internal.controller.ts

```ts
import { Controller, Get, Param, Res } from '@nestjs/common';
import { EseecloudAdapter } from '../adapters/eseecloud/eseecloud.adapter';

@Controller('internal/devices')
export class InternalController {
  constructor(private readonly esee: EseecloudAdapter) {}

  @Get(':id/frame')
  async getFrame(@Param('id') id: string, @Res() res) {
    const buf = await this.esee.getFrame(id);
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(buf);
  }
}
```

### src/ws/alerts.gateway.ts

```ts
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';

@WebSocketGateway({ cors: true })
export class AlertsGateway {
  @WebSocketServer()
  server: any;

  broadcast(event: any) {
    this.server.emit('alert', event);
  }
}
```

**Notes for Copilot**: implement standard controllers/services for Devices, Events, Clips, Snapshots with CRUD endpoints matching `README.md`. Keep `/api` prefix for public endpoints and `/internal` for adapters/AI.

---

## 2. EseeCloud Adapter (Windows) — Full Plan and Starter Code

**Purpose**: capture EseeCloud desktop app window, split into regions, provide frames, audio capture, and talk automation.

**Language**: Python recommended for Windows APIs and ultralytics AI integration. Node alternative possible.

### Folder

```
eseecloud-adapter/
├── requirements.txt
├── capture.py
├── regions.json
├── talk.py
├── streamer.py
```

### requirements.txt

```
numpy
opencv-python
pillow
requests
pywin32
pywinauto
sounddevice
ffmpeg-python
```

### capture.py (core capture + crop + JPEG output)

```python
import time
import cv2
import numpy as np
from PIL import Image
import io
import requests

# Placeholder: use Windows Graphics Capture or pywin32 to capture window
def capture_window_by_title(title="EseeCloud"):
    # TODO: replace with Windows Graphics Capture for production
    # For now, capture full screen as fallback
    img = np.array(Image.grab())  # PIL Image.grab requires pillow-simd or pyscreenshot
    return cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

REGIONS = {
  "cam1": [0,0,960,540],
  "cam2": [960,0,960,540],
  "cam3": [0,540,960,540],
  "cam4": [960,540,960,540]
}

def crop(frame, region):
    x,y,w,h = region
    return frame[y:y+h, x:x+w]

def jpeg_bytes(img_bgr, quality=80):
    ret, buf = cv2.imencode('.jpg', img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return buf.tobytes()

if __name__ == "__main__":
    while True:
        frame = capture_window_by_title()
        for id, region in REGIONS.items():
            sub = crop(frame, region)
            jpg = jpeg_bytes(sub)
            # write to local file for backend to serve or push to HTTP endpoint
            with open(f"/tmp/{id}.jpg", "wb") as f:
                f.write(jpg)
        time.sleep(0.1)
```

### talk.py (UI automation + virtual mic control)

```python
from pywinauto import Application
import time

def press_talk_button(window_title="EseeCloud"):
    # TODO: find talk button by control id or coordinates
    app = Application(backend="uia").connect(title_re=window_title)
    win = app.window(title_re=window_title)
    # Example: click coordinates relative to window
    rect = win.rectangle()
    # compute talk button coords from config
    x = rect.left + 100
    y = rect.bottom - 50
    win.click_input(coords=(x, y))

def release_talk_button(window_title="EseeCloud"):
    # If talk is hold-to-talk, release by clicking again or sending key
    press_talk_button(window_title)
```

### streamer.py (ffmpeg HLS pipeline example)

```python
import subprocess
import shlex

def start_ffmpeg_from_pipe(width=960, height=540, fps=15, out_dir="/var/guarddog/hls/cam1"):
    cmd = (
      "ffmpeg -f rawvideo -pix_fmt bgr24 -s {w}x{h} -r {fps} -i - "
      "-c:v libx264 -preset ultrafast -tune zerolatency -f hls "
      "-hls_time 4 -hls_list_size 5 -hls_flags delete_segments {out}/index.m3u8"
    ).format(w=width, h=height, fps=fps, out=out_dir)
    p = subprocess.Popen(shlex.split(cmd), stdin=subprocess.PIPE)
    return p
```

### Integration notes

- Adapter should expose frames via local file or HTTP endpoint consumed by backend `/internal/devices/:id/frame`.
- Use VB‑Audio Cable as virtual mic; route adapter microphone capture into virtual mic when talk is active.
- Replace placeholder capture with Windows Graphics Capture (C++/C# or Python via winrt) for production.

---

## 3. Ring Adapter

**Purpose**: run `ring-mqtt`, capture RTSP endpoints, subscribe to MQTT events, create Event records.

### Folder

```
ring-adapter/
├── ring-mqtt-config.yaml
├── ring-listener.js
```

### ring-listener.js (Node example)

```js
const mqtt = require('mqtt');
const axios = require('axios');

const MQTT_URL = process.env.RING_MQTT_URL || 'mqtt://localhost:1883';
const API_BASE = process.env.GUARDDOG_API || 'http://localhost:5000';

const client = mqtt.connect(MQTT_URL);

client.on('connect', () => {
  console.log('connected to ring-mqtt');
  client.subscribe('ring/+/motion');
  client.subscribe('ring/+/ding');
});

client.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    // topic example: ring/frontdoor/motion
    const parts = topic.split('/');
    const deviceKey = parts[1];
    const eventType = parts[2] === 'motion' ? 'MOTION' : 'RING_DING';
    // POST to backend events
    await axios.post(`${API_BASE}/api/events`, {
      device_key: deviceKey,
      type: eventType,
      metadata: payload
    });
  } catch (err) {
    console.error('ring listener error', err);
  }
});
```

### Notes

- `ring-mqtt` provides RTSP endpoints (e.g., `rtsp://127.0.0.1:8554/frontdoor`). Store these in `Device.streamUrl`.
- Backend should convert RTSP → HLS via ffmpeg when requested.

---

## 4. AI Service (YOLOv8n CPU) — Python

**Purpose**: poll `/internal/devices/:id/frame`, run YOLO, POST detections to `/internal/ai/events`.

### Folder

```
python-ai/
├── requirements.txt
├── ai_service.py
```

### requirements.txt

```
ultralytics
opencv-python
requests
numpy
```

### ai_service.py

```python
import time
import requests
import cv2
import numpy as np
from ultralytics import YOLO

API_BASE = "http://localhost:5000"
MODEL_PATH = "yolov8n.pt"  # local model file

model = YOLO(MODEL_PATH)

def fetch_frame(device_id):
    r = requests.get(f"{API_BASE}/internal/devices/{device_id}/frame", timeout=5)
    if r.status_code == 200:
        arr = np.frombuffer(r.content, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    return None

def post_event(payload):
    requests.post(f"{API_BASE}/internal/ai/events", json=payload, timeout=5)

def run_loop(device_ids):
    while True:
        for did in device_ids:
            frame = fetch_frame(did)
            if frame is None:
                continue
            results = model(frame, imgsz=640)
            for r in results:
                for box in r.boxes:
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    label = model.names[cls]
                    if label in ['person','car','truck','dog','cat','package','bicycle']:
                        payload = {
                          "device_id": did,
                          "type": f"AI_{label.upper()}",
                          "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                          "confidence": conf,
                          "bbox": box.xyxy[0].tolist()
                        }
                        post_event(payload)
        time.sleep(1)

if __name__ == "__main__":
    # Discover devices from backend
    r = requests.get(f"{API_BASE}/api/devices")
    device_ids = [d['id'] for d in r.json()]
    run_loop(device_ids)
```

### Notes

- Use `yolov8n.pt` for CPU inference; tune `imgsz` and `conf` thresholds for performance.
- AI service should be run as a separate process or Windows service.

---

## 5. React Frontend and Components

**Purpose**: MultiCamGrid and SingleCamView with HLS/WebRTC players, WebSocket alerts, and API client.

### Folder

```
client/
├── package.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── api/
│   │   └── devices.ts
│   ├── components/
│   │   ├── MultiCamGrid.tsx
│   │   └── SingleCamView.tsx
│   └── hooks/
│       └── useWebSocket.ts
```

### client/package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "vite preview"
  }
}
```

### src/api/devices.ts

```ts
export async function fetchDevices() {
  const res = await fetch('/api/devices');
  return res.json();
}

export async function getLive(deviceId: string) {
  const res = await fetch(`/api/devices/${deviceId}/live`);
  return res.json();
}
```

### src/hooks/useWebSocket.ts

```ts
import { useEffect, useRef } from 'react';

export function useWebSocket(url: string, onMessage: (data:any)=>void) {
  const wsRef = useRef<WebSocket|null>(null);
  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
    wsRef.current = ws;
    return () => ws.close();
  }, [url]);
  return wsRef;
}
```

`MultiCamGrid` and `SingleCamView` — use the components already in the branch. Add HLS player integration using `hls.js` for HLS streams and WebRTC for low-latency if implemented.

### HLS player example

```tsx
import Hls from 'hls.js';
import React, { useRef, useEffect } from 'react';

export function HlsPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement|null>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(videoRef.current);
      return () => hls.destroy();
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = src;
    }
  }, [src]);
  return <video ref={videoRef} controls autoPlay muted style={{width:'100%',height:'100%'}} />;
}
```

---

## 6. Electron Desktop Wrapper

**Purpose**: package the web UI into a Windows installer.

### Folder

```
desktop/
├── package.json
├── electron/
│   ├── main.js
│   └── preload.js
```

### desktop/package.json

```json
{
  "name": "guarddog-desktop",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "package": "electron-builder --win"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

### electron/main.js

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadURL('http://localhost:5000');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

### Packaging

- Use `electron-builder` to create `GuardDog-Setup.exe`.
- Ensure backend and adapter services are installed or started by the installer (create a simple `start-backend.bat` or Windows service).

---

## 7. Android Compose Client Skeleton

**Purpose**: Android app that consumes backend API and shows multi/single cam views.

### Folder

```
android/
├── app/
│   └── src/main/java/com/guarddog/
│       ├── MainActivity.kt
│       └── screens/
│           ├── MultiCamScreen.kt
│           └── SingleCamScreen.kt
```

### MainActivity.kt

```kotlin
package com.guarddog

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.guarddog.screens.MultiCamScreen

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      MultiCamScreen(onDeviceClick = { deviceId ->
        // navigate to single cam
      })
    }
  }
}
```

`MultiCamScreen.kt` and `SingleCamScreen.kt` — use the Compose examples from `README.md`. Use ExoPlayer for HLS playback.

---

## 8. OneDrive Storage Layout and Local Sync

### Folder layout to create on Windows mini-PC

```
C:\Users\<user>\OneDrive\guarddog\
  clips\
    cam1\
    cam2\
    cam3\
    cam4\
    ring1\
    ring2\
  snapshots\
    cam1\
    cam2\
    cam3\
    cam4\
    ring1\
    ring2\
```

### Backend storage service (pseudo)

- Save clips to `process.env.SOVEREIGN_STORAGE_PATH || 'C:\\Users\\<user>\\OneDrive\\guarddog\\clips'`.
- Save snapshots to `...\\snapshots`.
- Ensure file names include device id and timestamp.

---

## 9. Build Scripts and Run Instructions

### Top-level scripts

- Start backend: `cd backend && npm run dev`
- Start EseeCloud adapter: `python eseecloud-adapter/capture.py`
- Start ring listener: `node ring-adapter/ring-listener.js`
- Start AI service: `python python-ai/ai_service.py`
- Start frontend: `cd client && npm run dev`
- Start electron: `cd desktop && npm start`

### Production

- Build frontend: `cd client && npm run build`
- Build backend: `cd backend && npm run build`
- Package electron: `cd desktop && npm run package`

---

## 10. Next Steps and Recommended PR Tasks

Create separate PRs for each major area to keep tests and CI stable:

1. **PR 1 Backend skeleton** — add `backend/` with entities, controllers, and internal endpoints.
2. **PR 2 EseeCloud adapter** — add `eseecloud-adapter/` with capture and talk stubs.
3. **PR 3 Ring adapter** — add `ring-adapter/` and `ring-mqtt` integration.
4. **PR 4 AI service** — add `python-ai/` YOLO service.
5. **PR 5 Frontend features** — wire HLS players and WebSocket alerts.
6. **PR 6 Electron packaging** — add `desktop/` packaging and installer config.
7. **PR 7 Android client** — add `android/` Compose app.

---

## Final Notes

- This file is the authoritative blueprint for Copilot Agents. It complements `README.md` (constraints) and `ARCHITECTURE.md` (master contract).
- For each PR, include **small, testable commits** and keep the existing passing tests intact.
- Hard rules (from `README.md`): never assume RTSP/ONVIF for EseeCloud C90; always route EseeCloud through the desktop app; always use `ring-mqtt` for Ring; AI is local CPU YOLO; clips/snapshots under OneDrive; stub with `TODO` rather than invent behavior.
