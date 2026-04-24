"""
capture.py

Development capture: grabs a screenshot (PIL) and crops regions defined in regions.json.
Production: replace capture_window_screenshot() with Windows Graphics Capture (winrt) implementation.
Writes latest JPEG for each region to ./frames/<device_id>.jpg
"""

import time
import json
from pathlib import Path
from PIL import ImageGrab
import cv2
import numpy as np

BASE = Path(__file__).parent
FRAMES_DIR = BASE / "frames"
FRAMES_DIR.mkdir(exist_ok=True)

with open(BASE / "regions.json", "r", encoding="utf-8") as _f:
    CONFIG = json.load(_f)
CONF = CONFIG["default"]
REGIONS = CONF["regions"]


def capture_window_screenshot():
    """Development fallback: full-screen screenshot."""
    img = ImageGrab.grab()
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def crop_region(frame_bgr, region):
    x, y, w, h = region
    h_img, w_img = frame_bgr.shape[:2]
    # clamp to image bounds
    x = max(0, min(x, w_img - 1))
    y = max(0, min(y, h_img - 1))
    w = max(1, min(w, w_img - x))
    h = max(1, min(h, h_img - y))
    return frame_bgr[y:y + h, x:x + w]


def jpeg_bytes(img_bgr, quality=80):
    ret, buf = cv2.imencode('.jpg', img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ret:
        raise RuntimeError("cv2.imencode failed")
    return buf.tobytes()


def write_frame(device_key, jpg):
    path = FRAMES_DIR / f"{device_key}.jpg"
    tmp = path.with_suffix(".jpg.tmp")
    with open(tmp, "wb") as f:
        f.write(jpg)
    tmp.replace(path)  # atomic on POSIX/Windows


def main_loop(fps=10):
    interval = 1.0 / fps
    print("EseeCloud adapter capture loop starting (dev screenshot mode).")
    while True:
        frame = capture_window_screenshot()
        for key, region in REGIONS.items():
            sub = crop_region(frame, region)
            jpg = jpeg_bytes(sub, quality=75)
            write_frame(key, jpg)
        time.sleep(interval)


if __name__ == "__main__":
    main_loop()
