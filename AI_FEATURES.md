# 🧠 AI Features — every feature, zero secrets, zero cost

GuardDog ships with a **free, local-first** AI stack. You don't need an OpenAI
key, a Google Cloud project, or any other paid service. Every feature below
runs on your own machine.

| Feature                           | Engine            | Cost | Internet? |
| --------------------------------- | ----------------- | ---- | --------- |
| Person / vehicle / pet detection  | Ollama (LLaVA)    | $0   | No¹       |
| Scene description                 | Ollama (LLaVA)    | $0   | No¹       |
| Daily summary text                | Ollama (Llama 3)  | $0   | No¹       |
| License plate / sign OCR          | Tesseract.js      | $0   | No        |
| Frigate-style motion events       | MQTT bridge       | $0   | No        |
| Cloud-grade vision (optional)     | OpenAI            | paid | yes       |

¹ One-time download to fetch the model weights.

## 1. One-time setup (5 min, free)

### A. Install Ollama (free local LLM runtime)

1. Download from <https://ollama.com/download> — one-click installer for Windows,
   macOS, and Linux.
2. Pull a vision model and a text model:
   ```bash
   ollama pull llava        # vision (~4 GB, runs on CPU or GPU)
   ollama pull llama3.2     # text (~2 GB)
   ```
3. Ollama runs as a background service on `http://localhost:11434`. That's it.

### B. (Optional) Install Frigate for higher-FPS local detection

If you want real-time object detection at 30+ FPS on many cameras, run
[Frigate](https://frigate.video). It uses CPU or a $25 Coral USB stick. GuardDog
listens to its MQTT events out of the box (see `MQTT_*` in `.env.example` and
`DATA_PIPE.md`).

## 2. Pick a provider

In `.env`:

```env
# Default. Auto-detects: tries Ollama → OpenAI → disabled.
AI_PROVIDER=auto

# Force a specific provider:
# AI_PROVIDER=ollama       # free, local
# AI_PROVIDER=openai       # paid, cloud
# AI_PROVIDER=disabled     # turn AI off completely
```

You can verify which one is active:

```bash
curl -b cookies.txt http://localhost:5000/api/ai/status
# { "provider": "ollama", "ollama": {...}, "openaiConfigured": false, "ocrEnabled": true }
```

## 3. Endpoints

All endpoints require an authenticated session (use `/api/auth/dev-login` if
you skipped Google OAuth).

### `GET /api/ai/status`

Reports the active provider and configured models.

### `POST /api/ai/analyze`

Body: `{ "image": "<base64 JPEG, no data: prefix>" }`. Returns a normalized
analysis routed through the active provider:

```json
{
  "detected": true,
  "type": "person",
  "confidence": 0.87,
  "description": "A person in a hoodie approaching the front door...",
  "metadata": { "provider": "ollama" }
}
```

### `POST /api/ai/ocr`

Multipart upload with field `image` (any image format Tesseract supports).
Returns:

```json
{
  "text": "GA-7XR-8821",
  "confidence": 0.92,
  "plate": "GA7XR8821"
}
```

The `plate` field is a heuristic license-plate extraction. `null` if no plate
pattern was found.

## 4. What about face recognition / pose estimation / etc.?

Several free libraries exist (`face-api.js`, `@tensorflow-models/coco-ssd`,
`@tensorflow-models/posenet`). They're not bundled by default because they
need `@tensorflow/tfjs-node` (~150 MB native binary) and would bloat install
for users who don't need them.

To opt in:

```bash
npm install @tensorflow/tfjs-node @tensorflow-models/coco-ssd face-api.js
```

Then `import` them in a new service module. The provider router is designed
so that adding a new backend is just a matter of returning the same
`MotionAnalysis` shape from your service.

## 5. Why the "auto" router?

* Lets you ship your `.env.example` with **no secrets**.
* Lets users go from `git clone` → working AI in one Ollama install.
* Lets power-users override with `AI_PROVIDER=openai` for cloud-grade quality.
* Lets you continue running the rest of the app even when no provider is
  available — calls just return a clean disabled stub instead of throwing.

## 6. Privacy

Ollama and Tesseract.js run **entirely on your machine**. No camera frames are
sent to any third party. Only switch to `AI_PROVIDER=openai` if you've decided
the cloud-AI quality is worth uploading frames to OpenAI.
