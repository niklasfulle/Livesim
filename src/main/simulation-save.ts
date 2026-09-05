import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SimulationSave } from "../engine/simulation.js";

export type SaveSlot = "manual" | "autosave";

const savePath = (workspace: string, slot: SaveSlot): string => path.join(workspace, "saves", slot === "manual" ? "lifesim.json" : "lifesim-autosave.json");

export const writeSimulationSave = async (workspace: string, save: SimulationSave, slot: SaveSlot = "manual"): Promise<string> => {
  const filePath = savePath(workspace, slot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(save, null, 2), "utf8");
  return filePath;
};

export const readSimulationSave = async (workspace: string, slot: SaveSlot = "manual"): Promise<SimulationSave | undefined> => {
  try {
    return JSON.parse(await readFile(savePath(workspace, slot), "utf8")) as SimulationSave;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};
