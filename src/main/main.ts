import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import type { SaveSlot } from "./simulation-save.js";
import { type ResidentLogFile, writeResidentLog } from "./resident-log.js";
import type { SimulationSave } from "../engine/simulation.js";
import { SaveWorkerClient } from "./save-worker-client.js";

let residentLogWrites = Promise.resolve();
let saveWorker: SaveWorkerClient;

const createWindow = (): void => {
  const window = new BrowserWindow({
    minWidth: 1100,
    minHeight: 700,
    width: 1500,
    height: 920,
    backgroundColor: "#101923",
    icon: path.join(typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd(), "assets/lifesim-icon.png"),
    title: "LifeSim",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  window.removeMenu();
  window.maximize();

  if (app.isPackaged) {
    void window.loadFile(path.join(__dirname, "../../renderer/index.html"));
  } else {
    void window.loadURL("http://127.0.0.1:5173");
  }
};

app.once("ready", () => {
  saveWorker = new SaveWorkerClient();
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("resident-log:write", (_event, log: ResidentLogFile) => {
    residentLogWrites = residentLogWrites
      .then(() => writeResidentLog(process.cwd(), log))
      .then(() => undefined);
    return residentLogWrites;
  });
  ipcMain.handle("simulation:save", (_event, request: { save: SimulationSave; slot?: SaveSlot }) => saveWorker.write(app.getPath("userData"), request.save, request.slot ?? "manual"));
  ipcMain.handle("simulation:load", (_event, slot: SaveSlot = "manual") => saveWorker.read(app.getPath("userData"), slot));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void saveWorker?.close();
  if (process.platform !== "darwin") app.quit();
});
