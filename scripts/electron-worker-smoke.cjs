const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("in-process-gpu");
app.setPath("userData", path.join(os.tmpdir(), `lifesim-electron-smoke-${Date.now()}`));

const rendererRoot = path.join(__dirname, "..", "out", "renderer");
const workerAsset = fs.readdirSync(path.join(rendererRoot, "assets")).find((file) => file.startsWith("simulation-worker-") && file.endsWith(".js"));
if (workerAsset === undefined) throw new Error("Simulation worker bundle was not found.");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await window.loadFile(path.join(rendererRoot, "index.html"));
  const workerUrl = pathToFileURL(path.join(rendererRoot, "assets", workerAsset)).href;
  const smokeSave = JSON.stringify({ map: "GGGGG\nGGGGG\nGGGGG", residents: [{ id: "smoke", name: "Smoke", position: { x: 1, y: 1 } }] });
  const result = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const worker = new Worker(${JSON.stringify(workerUrl)}, { type: "module" });
    worker.addEventListener("message", (event) => {
      if (event.data.type === "ready") { worker.terminate(); resolve(event.data.snapshot.time === 0); }
      if (event.data.type === "error") reject(new Error(event.data.message));
    });
    worker.addEventListener("error", reject);
    worker.postMessage({ type: "start", save: ${smokeSave} });
  })`);
  if (result !== true) throw new Error("Simulation worker did not return its initial snapshot.");
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
