import { describe, expect, it } from "vitest";
import { SimulationEngine } from "./simulation.js";

describe("resident meals", () => {
  it("makes a hungry resident completely full", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }]
    });

    while (simulation.snapshot().residents[0].hunger < 80 || simulation.snapshot().clock.phase === "night") {
      simulation.advance();
    }
    simulation.donateMeal("nia");
    simulation.advance();

    expect(simulation.snapshot().residents[0].hunger).toBe(0);
  });
});
