# GuardDog Backend (NestJS Skeleton)

This folder contains the standalone NestJS backend skeleton described in
`ARCHITECTURE_FULL.md` (PR 1). It is intentionally separate from the existing
Express/Drizzle server in `../server/` and can be developed and run on its own
port (default `5000`).

## Modules

- **Devices**, **Events**, **Clips**, **Snapshots** — minimal CRUD controllers
  and services backed by TypeORM entities, persisted in SQLite by default.
- **Internal controller** — `/internal/devices/:id/frame` returns a JPEG frame
  served by the EseeCloud adapter (placeholder image for now).
- **Adapters** — `eseecloud` and `ring` stubs ready to be expanded into real
  capture/MQTT integrations in subsequent PRs.
- **AlertsGateway** — Socket.IO WebSocket gateway that emits `alert` events to
  connected clients.

## Routing convention

- Public REST endpoints use the `/api` prefix (set globally in `main.ts`).
- Adapter and AI integrations call internal endpoints under `/internal/`
  (no `/api` prefix), matching the architecture blueprint.

## Install & run

```bash
cd backend
npm install
npm run dev
```

Expected log line:

```
GuardDog backend listening on 5000
```

## Smoke tests

```bash
curl http://localhost:5000/api/devices             # -> []
curl -I http://localhost:5000/internal/devices/x/frame  # -> 200 image/jpeg
curl http://localhost:5000/api/events              # -> []
```

WebSocket (Socket.IO) test from a browser console:

```js
const s = io('http://localhost:5000');
s.on('alert', (e) => console.log('alert', e));
```

## Configuration

- `PORT` — HTTP port (default `5000`).
- `DATABASE_URL` — SQLite database file path (default `guarddog.db`).
