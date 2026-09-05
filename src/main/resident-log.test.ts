import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeResidentLog } from "./resident-log.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("resident log file", () => {
  it("writes the complete resident chronology to a fixed logs file in the project", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "livesim-log-"));
    temporaryDirectories.push(workspace);
    const log = {
      time: 3,
      clock: { day: 1, hour: 6, minute: 45, phase: "dawn" as const },
      residents: [{
        id: "nia",
        name: "Nia",
        log: [{ time: 3, day: 1, hour: 6, minute: 45, message: "Wasser bei 2/0 entdeckt." }]
      }]
    };

    const filePath = await writeResidentLog(workspace, log);

    expect(filePath).toBe(path.join(workspace, "logs", "resident-log.json"));
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(log);
  });
});
