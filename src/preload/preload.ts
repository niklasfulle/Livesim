import { contextBridge, ipcRenderer } from "electron";
import type { ResidentLogFile } from "../main/resident-log.js";

contextBridge.exposeInMainWorld("desktop", {
  appVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  writeResidentLog: (log: ResidentLogFile): Promise<void> => ipcRenderer.invoke("resident-log:write", log)
});
