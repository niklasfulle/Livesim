import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { type ResidentLogFile, writeResidentLog } from "./resident-log.js";

let residentLogWrites = Promise.resolve();

const createWindow = (): void => {
  const window = new BrowserWindow({
    minWidth: 1100,
    minHeight: 700,
    width: 1500,
    height: 920,
    backgroundColor: "#101923",
    title: "LifeSim",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  if (app.isPackaged) {
    void window.loadFile(path.join(__dirname, "../../renderer/index.html"));
  } else {
    void window.loadURL("http://127.0.0.1:5173");
  }
};

app.once("ready", () => {
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("resident-log:write", (_event, log: ResidentLogFile) => {
    residentLogWrites = residentLogWrites
      .then(() => writeResidentLog(process.cwd(), log))
      .then(() => undefined);
    return residentLogWrites;
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
