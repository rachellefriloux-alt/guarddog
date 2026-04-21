import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_URL = "http://localhost:5000";
const DEFAULT_SERVER_TIMEOUT_MS = 30000;
let mainWindow: BrowserWindow | null = null;

function getServerTimeoutMs(): number {
  const rawTimeout = Number(process.env.GUARDDOG_SERVER_TIMEOUT_MS);
  return Number.isFinite(rawTimeout) && rawTimeout > 0
    ? rawTimeout
    : DEFAULT_SERVER_TIMEOUT_MS;
}

function resolveServerEntryPath(): string {
  const configuredPath = process.env.GUARDDOG_SERVER_ENTRY;
  const serverEntryPath = configuredPath
    ? path.resolve(app.getAppPath(), configuredPath)
    : path.join(app.getAppPath(), "dist", "index.js");

  if (!fs.existsSync(serverEntryPath)) {
    throw new Error(`Server entry not found at ${serverEntryPath}`);
  }

  return serverEntryPath;
}

async function waitForServer(url: string, timeoutMs = getServerTimeoutMs()): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404 || response.status === 401) {
        return;
      }
    } catch {
      // Server not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for server at ${url}`);
}

async function startServerIfPackaged(): Promise<void> {
  if (!app.isPackaged) {
    return;
  }

  process.env.NODE_ENV = "production";
  process.env.PORT = process.env.PORT || "5000";

  const serverEntryPath = resolveServerEntryPath();
  await import(pathToFileURL(serverEntryPath).href);
}

function createWindow(): void {
  const iconPath = path.join(app.getAppPath(), "build", "icon.png");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  await startServerIfPackaged();
  await waitForServer(SERVER_URL);

  createWindow();
  await mainWindow?.loadURL(SERVER_URL);
}

app.whenReady().then(() => {
  bootstrap().catch((error) => {
    console.error("Failed to start GuardDog desktop app:", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
