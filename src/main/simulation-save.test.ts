import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { SimulationEngine } from "../engine/simulation.js";
import { readSimulationSave, writeSimulationSave } from "./simulation-save.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("simulation save files", () => {
  it("writes and reads a complete simulation save", async () => {
    const workspace = await mkdtemp(`${tmpdir()}\\lifesim-save-`);
    temporaryDirectories.push(workspace);
    const simulation = SimulationEngine.start({ map: "GG", residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }] });
    simulation.advance();

    await writeSimulationSave(workspace, simulation.save());

    expect(await readSimulationSave(workspace)).toEqual(simulation.save());
  });

  it("returns no save when a new installation has no save file", async () => {
    const workspace = await mkdtemp(`${tmpdir()}\\lifesim-empty-`);
    temporaryDirectories.push(workspace);

    expect(await readSimulationSave(workspace)).toBeUndefined();
  });

  it("keeps manual and autosave slots independent", async () => {
    const workspace = await mkdtemp(`${tmpdir()}\\lifesim-slots-`);
    temporaryDirectories.push(workspace);
    const simulation = SimulationEngine.start({ map: "G", residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }] });

    await writeSimulationSave(workspace, simulation.save(), "manual");
    simulation.advance();
    await writeSimulationSave(workspace, simulation.save(), "autosave");

    expect((await readSimulationSave(workspace, "manual"))?.time).toBe(0);
    expect((await readSimulationSave(workspace, "autosave"))?.time).toBe(1);
  });
});
