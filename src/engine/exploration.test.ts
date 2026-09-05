import { describe, expect, it } from "vitest";
import { SimulationEngine } from "./simulation.js";

const firstExplorationDirection = (randomValue: number): string => {
  const home = { x: 4, y: 4 };
  const simulation = SimulationEngine.start({
    map: Array.from({ length: 9 }, () => "G".repeat(9)).join("\n"),
    random: () => randomValue,
    residents: [{ id: "nia", name: "Nia", position: home }]
  });

  for (let tick = 0; tick < 12; tick += 1) {
    simulation.advance();
    const position = simulation.snapshot().residents[0].position;
    if (position.x < home.x) return "west";
    if (position.x > home.x) return "east";
    if (position.y < home.y) return "north";
    if (position.y > home.y) return "south";
  }
  throw new Error("Resident did not begin exploring");
};

describe("resident exploration", () => {
  it("keeps its first exploration direction stable", () => {
    const directions = new Set([0.05, 0.3, 0.55, 0.8].map(firstExplorationDirection));

    expect(directions).toEqual(new Set(["east"]));
  });
});
