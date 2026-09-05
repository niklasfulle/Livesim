import { describe, expect, it } from "vitest";
import { createSimulationStart, isSimulationCommand } from "./simulation-worker-protocol.js";

describe("simulation worker protocol", () => {
  it("creates a start command that can cross the worker boundary", () => {
    const command = createSimulationStart({ map: "...", residents: [] });
    expect(command).toEqual({ type: "start", save: { map: "...", residents: [] } });
    expect(isSimulationCommand(command)).toBe(true);
    expect(isSimulationCommand({ type: "unknown" })).toBe(false);
  });
});
