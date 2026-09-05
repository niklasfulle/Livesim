import { parentPort } from "node:worker_threads";
import { readSimulationSave, writeSimulationSave, type SaveSlot } from "./simulation-save.js";
import type { SimulationSave } from "../engine/simulation.js";

type SaveRequest =
  | { id: number; type: "write"; workspace: string; save: SimulationSave; slot: SaveSlot }
  | { id: number; type: "read"; workspace: string; slot: SaveSlot };

if (parentPort === null) throw new Error("Save worker requires a parent port.");

parentPort.on("message", async (request: SaveRequest) => {
  try {
    const result = request.type === "write"
      ? await writeSimulationSave(request.workspace, request.save, request.slot)
      : await readSimulationSave(request.workspace, request.slot);
    parentPort?.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    parentPort?.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
