# 🔌 Data Pipe — getting cameras into GuardDog

GuardDog displays whatever **RTSP** URL you point it at. Different camera
families need different upstream tooling to *expose* an RTSP endpoint, but
once an RTSP URL exists, the dashboard, recorder, and motion pipeline treat
them all the same.

```
                 ┌─────────────────────┐
   Ring ────►    │ ring-mqtt + go2rtc  │ ──► rtsp://localhost:8554/<camera>_live
                 └─────────────────────┘                  │
                                                          ▼
                 ┌─────────────────────┐         ┌────────────────────┐
   eSeeCloud ──► │ Native RTSP / ONVIF │ ──────► │      GuardDog      │
                 └─────────────────────┘  rtsp://admin:…@nvr:554/live │
                                                          │           │
                 ┌─────────────────────┐                  │           │
   Frigate ────► │ MQTT (events topic) │ ──────► motion ──┘           │
                 └─────────────────────┘                              │
                                                          OneDrive ◄──┘
                                                          /iCloud
                                                          /Drive
```

## 1. Ring → RTSP via `ring-mqtt` + `go2rtc`

Ring's API does not publish a public RTSP feed, so we hijack it:

| Component   | Role                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `ring-mqtt` | Logs in to your Ring account (email + 2FA refresh token), exposes camera streams over WebRTC, and publishes motion / doorbell events to an MQTT broker. |
| `go2rtc`    | Repackages the WebRTC stream as RTSP (and HLS / WebRTC for the browser). |
| Mosquitto   | The MQTT broker that ring-mqtt publishes to and that GuardDog subscribes to. |

### Recommended setup (Docker compose, free)

```yaml
# docker-compose.yml — drop next to GuardDog
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports: ["1883:1883"]
    volumes: ["./mosquitto:/mosquitto/config"]

  ring-mqtt:
    image: tsightler/ring-mqtt:latest
    network_mode: host           # required for WebRTC
    environment:
      MQTTHOST: localhost
      ENABLERTSPSERVER: "true"   # exposes RTSP on :8554
    volumes: ["./ring-data:/data"]

  go2rtc:                         # only needed if you want browser HLS
    image: alexxit/go2rtc:latest
    network_mode: host
    volumes: ["./go2rtc.yaml:/config/go2rtc.yaml"]
```

After `docker compose up -d`, ring-mqtt prints RTSP URLs like:

```
rtsp://127.0.0.1:8554/4c249825f4c8_live
rtsp://127.0.0.1:8554/4c24981d7c07_live
```

Add those to GuardDog two ways:

**A. Through the dashboard** — Cameras → Add Camera, type `ring`, paste the
RTSP URL into `streamUrl`.

**B. As a "Sovereign" 24/7 recording** — drop a JSON file at the path you
configure in `SOVEREIGN_STREAMS_FILE`:

```json
[
  {"name": "Front_Door", "url": "rtsp://127.0.0.1:8554/4c249825f4c8_live"},
  {"name": "Back_Door",  "url": "rtsp://127.0.0.1:8554/4c24981d7c07_live"}
]
```

Then in `.env`:
```env
SOVEREIGN_STREAMS_FILE=./config/sovereign-streams.json
SOVEREIGN_STORAGE_PATH=C:\Users\you\OneDrive\GuardDog_Surveillance
```

GuardDog will record each stream as 10-minute MP4 segments straight into the
OneDrive folder (no re-encode, auto-reconnect on network blip).

### Wire ring-mqtt motion events into GuardDog

ring-mqtt publishes events to `ring/<id>/<camera>/motion` and similar topics.
Point GuardDog's MQTT bridge at the same broker and it will record motion
events as detections:

```env
MQTT_URL=mqtt://localhost:1883
MQTT_TOPIC=ring/+/+/motion
```

The bridge accepts both Frigate's `{type, after}` envelope and a generic
`{camera, label, score}` payload.

## 2. eSeeCloud / generic ONVIF cameras → RTSP directly

eSeeCloud cameras (and most ONVIF NVRs — Hikvision, Dahua, Reolink, Amcrest)
already publish RTSP. You just need:

1. The NVR's IP on your LAN (router admin page or `nmap -sn 192.168.1.0/24`).
2. The admin credentials.
3. The vendor's RTSP path:

   | Vendor                     | RTSP path                            |
   | -------------------------- | ------------------------------------ |
   | eSeeCloud / Dahua          | `/cam/realmonitor?channel=1&subtype=0` |
   | Hikvision                  | `/Streaming/Channels/101`            |
   | Reolink                    | `/h264Preview_01_main`               |
   | Amcrest                    | `/cam/realmonitor?channel=1&subtype=0` |
   | Generic ONVIF              | use `onvif-discovery` to enumerate   |

So an eSeeCloud feed looks like:

```
rtsp://admin:YOUR_PASSWORD@192.168.1.50:554/cam/realmonitor?channel=1&subtype=0
```

Add it the same two ways as Ring (dashboard or sovereign-streams.json).

## 3. Optional: Frigate for free local AI

If you don't want to pay OpenAI, run [Frigate](https://frigate.video) on the
same machine. Frigate does person/vehicle/animal detection in CPU or with a
$25 Coral USB stick, and publishes events to MQTT. GuardDog's MQTT bridge
turns those events into detections in the dashboard.

```env
MQTT_URL=mqtt://localhost:1883
MQTT_TOPIC=frigate/events
# Leave OPENAI_API_KEY unset — cloud AI cleanly disables itself.
```

## 4. Network bandwidth notes

The Sovereign Recorder uses `-c copy` — it never re-encodes. So the bandwidth
out of the camera onto disk is ~**the camera's existing bitrate** (typically
2–4 Mbps for 1080p H.264). Cloud sync bandwidth is the same number, smoothed
over time by your OneDrive / Drive client.

Rule of thumb:

| Cameras | Bitrate per camera | Daily disk | Daily upload |
| ------- | ------------------ | ---------- | ------------ |
| 1       | 3 Mbps             | ~32 GB     | ~32 GB       |
| 4       | 3 Mbps             | ~130 GB    | ~130 GB      |

Most home connections can't sustain 130 GB/day uploads. For multi-camera 24/7
recording, either:

* Set `CLEANUP_OLDER_THAN_DAYS` to a small number so old buffers age out.
* Point `SOVEREIGN_STORAGE_PATH` at a local folder *outside* the OneDrive
  sync root and let your cloud client only sync the most-recent day.
* Use a sub-stream / lower-bitrate RTSP profile (`subtype=1` on Dahua/eSee).
