import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  let readyHandler = (): void => undefined;
  const maximize = vi.fn();
  const removeMenu = vi.fn();
  const loadURL = vi.fn(() => Promise.resolve());
  const loadFile = vi.fn(() => Promise.resolve());
  const browserWindowOptions = vi.fn();

  class BrowserWindow {
    static getAllWindows = vi.fn(() => []);

    constructor(options: unknown) {
      browserWindowOptions(options);
    }

    maximize = maximize;
    removeMenu = removeMenu;
    loadURL = loadURL;
    loadFile = loadFile;
  }

  return {
    app: {
      getVersion: vi.fn(() => "0.1.0"),
      isPackaged: false,
      on: vi.fn(),
      once: vi.fn((_event: string, handler: () => void) => { readyHandler = handler; }),
      quit: vi.fn()
    },
    BrowserWindow,
    browserWindowOptions,
    ipcMain: { handle: vi.fn() },
    loadURL,
    maximize,
    removeMenu,
    runReadyHandler: (): void => readyHandler()
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  BrowserWindow: electron.BrowserWindow,
  ipcMain: electron.ipcMain
}));

describe("LifeSim desktop window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("starts maximized on the available screen", async () => {
    await import("./main.js");

    electron.runReadyHandler();

    expect(electron.browserWindowOptions).toHaveBeenCalledOnce();
    expect(electron.maximize).toHaveBeenCalledOnce();
    expect(electron.removeMenu).toHaveBeenCalledOnce();
    expect(electron.loadURL).toHaveBeenCalledWith("http://127.0.0.1:5173");
  });
});
