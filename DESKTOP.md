# GuardDog Desktop Application

GuardDog can be packaged as a native desktop app with Electron.

## Prerequisites

- Node.js 18+
- npm

## Build a desktop installer

```bash
npm install
npm run electron:build
```

Installers are generated in:

```text
release/
```

On Linux, the default targets are:

- `AppImage`
- `deb`

The Electron configuration also includes Windows (`nsis`) and macOS (`dmg`) targets.

## Run the desktop app in development

```bash
npm run electron:dev
```

This starts the GuardDog web server and opens it in an Electron window.

## Environment and data storage

Copy and configure environment variables before production use:

```bash
cp .env.example .env
```

Important notes:

- `SESSION_SECRET` should be changed for production.
- Google and OpenAI keys are optional if you are not using those integrations.
- If `DATABASE_URL` is not set, GuardDog falls back to in-memory storage.
  - This makes local/offline usage easier.
  - Data is not persisted across app restarts.

For persistent data, configure PostgreSQL in `.env` and run:

```bash
npm run db:push
```
