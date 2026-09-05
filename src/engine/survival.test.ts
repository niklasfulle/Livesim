import { describe, expect, it } from "vitest";
import { SimulationEngine } from "./simulation.js";

describe("survival needs", () => {
  it("keeps eating berries during the day instead of starving beside food", () => {
    const simulation = SimulationEngine.start({ map: "GGGB", residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }], random: () => 0 });
    for (let tick = 0; tick < 100; tick += 1) simulation.advance();
    const resident = simulation.snapshot().residents[0];
    expect(resident.health).toBe(100);
    expect(resident.log.filter((entry) => entry.message.startsWith("Beere gegessen")).length).toBeGreaterThan(1);
    expect(resident.log.find((entry) => entry.message.startsWith("Beere gegessen"))?.message).toBe("Beere gegessen (+15 Sättigung).");
  });
  it("returns to unexplored terrain after coming home on successive days", () => {
    const simulation = SimulationEngine.start({ map: `${"G".repeat(35)}W`, residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }], random: () => 0 });
    for (let tick = 0; tick < 150; tick += 1) simulation.advance();
    expect(simulation.snapshot().residents[0].knownWaters).toEqual([{ x: 35, y: 0 }]);
  });
  it("cooks at home and takes provisions on an expedition", () => {
    const simulation = SimulationEngine.start({ map: "G".repeat(40), residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 }, resources: ["fish", "wood", "plant", "meal", "berry"] }] });
    simulation.advance();
    simulation.advance();
    expect(simulation.snapshot().residents[0]).toMatchObject({ hunger: 0, inventory: { meals: 1, berries: 1 } });
  });
  it("tracks hunger separately from health and energy", () => {
    const simulation = SimulationEngine.start({ map: "GGGGGG", residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }] });
    const before = simulation.snapshot().residents[0];
    for (let tick = 0; tick < 8; tick += 1) simulation.advance();
    const after = simulation.snapshot().residents[0];
    expect(after.hunger).toBeGreaterThan(before.hunger);
    expect(after.health).toBe(100);
    expect(after.fitness).toBeLessThan(before.fitness);
  });
  it("raises hunger slowly during a full night hour", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }]
    });

    while (simulation.snapshot().clock.phase !== "night") {
      simulation.advance();
    }

    const hungerAtNightfall = simulation.snapshot().residents[0].hunger;
    simulation.advance();

    expect(simulation.snapshot().residents[0].hunger - hungerAtNightfall).toBeCloseTo(0.8);
  });
  it("eventually dies without food and cannot resume work", () => {
    const simulation = SimulationEngine.start({ map: "G", residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }] });
    for (let tick = 0; tick < 1200; tick += 1) simulation.advance();
    expect(simulation.snapshot().residents[0]).toMatchObject({ health: 0, state: "dead" });
    expect(simulation.snapshot().residents[0].log).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: "Gesundheit kritisch." }),
      expect.objectContaining({ message: "Ist gestorben." })
    ]));
    simulation.advance();
    expect(simulation.snapshot().residents[0].state).toBe("dead");
  });
});
