import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_URL = "http://127.0.0.1:5000";
let mainWindow: BrowserWindow | null = null;

async function waitForServer(url: string, timeoutMs = 60000): Promise<void> {
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

  const serverEntryPath = path.join(app.getAppPath(), "dist", "index.js");
  await import(pathToFileURL(serverEntryPath).href);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
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
