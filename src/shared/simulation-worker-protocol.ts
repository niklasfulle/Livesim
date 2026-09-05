import type { ResidentSeed, SimulationSave, SimulationSnapshot } from "../engine/simulation.js";

export type SimulationStart = { map: string; residents: ResidentSeed[] } | { save: SimulationSave };
export type SimulationCommand =
  | { type: "start"; save: SimulationStart }
  | { type: "advance" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "save" };
export type SimulationWorkerEvent =
  | { type: "ready"; snapshot: SimulationSnapshot }
  | { type: "snapshot"; snapshot: SimulationSnapshot }
  | { type: "saved"; save: SimulationSave }
  | { type: "error"; message: string };

export const createSimulationStart = (start: SimulationStart): SimulationCommand => ({ type: "start", save: start });

export const isSimulationCommand = (value: unknown): value is SimulationCommand => {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  return ["start", "advance", "pause", "resume", "save"].includes((value as { type: string }).type);
};
