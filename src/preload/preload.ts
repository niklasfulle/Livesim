import { contextBridge, ipcRenderer } from "electron";
import type { SimulationSave } from "../engine/simulation.js";
import type { ResidentLogFile } from "../main/resident-log.js";
import type { SaveSlot } from "../main/simulation-save.js";

contextBridge.exposeInMainWorld("desktop", {
  appVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  writeResidentLog: (log: ResidentLogFile): Promise<void> => ipcRenderer.invoke("resident-log:write", log),
  saveSimulation: (save: SimulationSave, slot: SaveSlot = "manual"): Promise<void> => ipcRenderer.invoke("simulation:save", { save, slot }),
  loadSimulation: (slot: SaveSlot = "manual"): Promise<SimulationSave | undefined> => ipcRenderer.invoke("simulation:load", slot)
});
