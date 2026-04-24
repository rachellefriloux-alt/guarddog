# AI Detection Service (PR 3)

This service polls the backend for frames, runs YOLOv8n detections, and posts
AI events back into the unified alert pipeline.

## Running

```
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python ai_service.py
```

## Environment Variables

See `.env.example`.

## Output

- AI events appear in `/api/events`
- Optional snapshots saved to `./snapshots`
