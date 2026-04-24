import time
import cv2
import numpy as np
import requests
from ultralytics import YOLO
from pathlib import Path
from config import BACKEND, POLL_INTERVAL, CONF_THRESHOLD, MODEL_PATH, SAVE_SNAPSHOTS, SNAPSHOT_DIR

Path(SNAPSHOT_DIR).mkdir(exist_ok=True)

model = YOLO(MODEL_PATH)


def fetch_frame(device_id):
    try:
        r = requests.get(f"{BACKEND}/internal/devices/{device_id}/frame", timeout=5)
        if r.status_code != 200:
            return None
        arr = np.frombuffer(r.content, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except requests.RequestException:
        return None


def post_event(device_id, label, conf, bbox):
    payload = {
        "deviceId": device_id,
        "type": f"AI_{label.upper()}",
        "metadata": {
            "confidence": conf,
            "bbox": bbox,
        },
    }
    try:
        requests.post(f"{BACKEND}/api/events", json=payload, timeout=5)
    except requests.RequestException:
        pass


def save_snapshot(device_id, frame):
    ts = int(time.time())
    path = Path(SNAPSHOT_DIR) / f"{device_id}_{ts}.jpg"
    cv2.imwrite(str(path), frame)


def run():
    print("AI service starting…")
    try:
        devices = requests.get(f"{BACKEND}/api/devices", timeout=10).json()
    except requests.RequestException as e:
        print(f"Failed to fetch devices from backend at {BACKEND}: {e}")
        return
    ids = [d["id"] for d in devices]

    while True:
        for did in ids:
            frame = fetch_frame(did)
            if frame is None:
                continue

            snapshot_taken = False
            results = model(frame, imgsz=640)
            for r in results:
                for box in r.boxes:
                    conf = float(box.conf[0])
                    if conf < CONF_THRESHOLD:
                        continue

                    cls = int(box.cls[0])
                    label = model.names[cls]
                    bbox = box.xyxy[0].tolist()

                    post_event(did, label, conf, bbox)

                    if SAVE_SNAPSHOTS and not snapshot_taken:
                        save_snapshot(did, frame)
                        snapshot_taken = True

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run()
