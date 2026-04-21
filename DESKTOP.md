# GuardDog Desktop Application (Windows 11)

GuardDog is packaged as a native Windows desktop app using Electron.

## Prerequisites

- [Node.js 18+](https://nodejs.org/) (LTS recommended)
- npm (included with Node.js)

## Install dependencies

Open **PowerShell** or **Command Prompt** in the project folder, then run:

```powershell
npm install
```

## Configure environment

Copy the example environment file and edit it with your settings:

```powershell
copy .env.example .env
```

Edit `.env` and set at minimum:

- `SESSION_SECRET` – a long random string (required for production)
- `GOOGLE_AUTH_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` – your Google OAuth client ID (required for login)
- `OPENAI_API_KEY` – optional, required for AI detection features

If `DATABASE_URL` is not set, GuardDog uses in-memory storage (data is lost on restart).

## Build the Windows installer

```powershell
npm run electron:build
```

The Windows installer (`.exe`) is generated in:

```text
release\
```

## Run in development mode

```powershell
npm run electron:dev
```

This starts the GuardDog server and opens it in an Electron window.

## Persistent storage (optional)

For persistent data, set up PostgreSQL, add `DATABASE_URL` to `.env`, then run:

```powershell
npm run db:push
```
