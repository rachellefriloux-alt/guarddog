"""
server.py

Small Flask server that serves latest frames written by capture.py.
Exposes:
- GET  /internal/devices/<device_key>/frame      -> image/jpeg
- POST /internal/devices/<device_key>/talk/start -> triggers start_talk()
- POST /internal/devices/<device_key>/talk/stop  -> triggers stop_talk()
"""

import os
import re
from pathlib import Path

from flask import Flask, abort, jsonify, send_file

from talk import start_talk, stop_talk

BASE = Path(__file__).parent
FRAMES_DIR = (BASE / "frames").resolve()
FRAMES_DIR.mkdir(exist_ok=True)
PLACEHOLDER = (BASE / "placeholder.jpg").resolve()

# Allow only safe device keys (alphanumeric, dash, underscore) to avoid
# path-traversal attacks against the frames directory.
DEVICE_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

app = Flask("eseecloud-adapter")


def _safe_key(device_key):
    if not device_key or not DEVICE_KEY_RE.match(device_key):
        abort(400, description="invalid device key")
    return device_key


def _frame_path(device_key):
    """Resolve the frame path and ensure it stays strictly within FRAMES_DIR."""
    candidate = (FRAMES_DIR / f"{device_key}.jpg").resolve()
    try:
        candidate.relative_to(FRAMES_DIR)
    except ValueError:
        abort(400, description="invalid device key")
    return candidate


@app.route("/internal/devices/<device_key>/frame", methods=["GET"])
def get_frame(device_key):
    key = _safe_key(device_key)
    path = _frame_path(key)
    if not path.exists():
        if PLACEHOLDER.exists():
            return send_file(str(PLACEHOLDER), mimetype="image/jpeg")
        return ("", 404)
    return send_file(str(path), mimetype="image/jpeg")


@app.route("/internal/devices/<device_key>/talk/start", methods=["POST"])
def api_start_talk(device_key):
    _safe_key(device_key)
    return jsonify(start_talk())


@app.route("/internal/devices/<device_key>/talk/stop", methods=["POST"])
def api_stop_talk(device_key):
    _safe_key(device_key)
    return jsonify(stop_talk())


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "6000"))
    # Bind to localhost by default; override with HOST env if you must expose it.
    host = os.environ.get("HOST", "127.0.0.1")
    app.run(host=host, port=port)
