import os
from dotenv import load_dotenv

load_dotenv()

BACKEND = os.getenv("BACKEND_URL", "http://localhost:5000")
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "0.5"))
CONF_THRESHOLD = float(os.getenv("CONF_THRESHOLD", "0.45"))
MODEL_PATH = os.getenv("MODEL_PATH", "yolov8n.pt")
SAVE_SNAPSHOTS = os.getenv("SAVE_SNAPSHOTS", "false").lower() == "true"
SNAPSHOT_DIR = os.getenv("SNAPSHOT_DIR", "./snapshots")
