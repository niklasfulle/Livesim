import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResidentLogEntry, SimulationClock } from "../engine/simulation.js";

export interface ResidentLogFile {
  time: number;
  clock: SimulationClock;
  residents: Array<{
    id: string;
    name: string;
    log: ResidentLogEntry[];
  }>;
}

export const writeResidentLog = async (workspace: string, log: ResidentLogFile): Promise<string> => {
  const filePath = path.join(workspace, "logs", "resident-log.json");
  const document: ResidentLogFile = {
    time: log.time,
    clock: { ...log.clock },
    residents: log.residents.map((resident) => ({
      id: resident.id,
      name: resident.name,
      log: resident.log.map((entry) => ({ ...entry }))
    }))
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(document, null, 2), "utf8");
  return filePath;
};
