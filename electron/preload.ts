import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("guarddogDesktop", {
  platform: process.platform,
});
