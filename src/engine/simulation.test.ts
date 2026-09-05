import { describe, expect, it } from "vitest";
import { SimulationEngine } from "./simulation.js";

describe("SimulationEngine", () => {
  it("restores a saved simulation without losing world or resident state", () => {
    const simulation = SimulationEngine.start({
      map: "GGW\nGGG",
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }],
      random: () => 0
    });
    for (let tick = 0; tick < 4; tick += 1) simulation.advance();

    const restored = SimulationEngine.fromSave(simulation.save(), () => 0);

    expect(restored.snapshot()).toEqual(simulation.snapshot());
  });

  it("advances the life cycle one tick at a time and accepts a donated meal", () => {
    const simulation = SimulationEngine.start({
      map: "GF\nGW",
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }]
    });

    simulation.advance();
    simulation.donateMeal("nia");

    const snapshot = simulation.snapshot();

    expect(snapshot).toMatchObject({
      time: 1,
      residents: [{ id: "nia", state: "eating", meals: 1, home: { x: 0, y: 0 } }]
    });
    expect(snapshot.world[0]).toEqual([
      { ground: "grass", stock: 100 },
      { ground: "grass", stock: 100 }
    ]);
  });

  it("reserves a clean protection zone when a resident establishes a home", () => {
    const simulation = SimulationEngine.start({
      map: "GGGGGGG\nGFGGGGG\nGGWGGGG\nGGGGGGG\nGGGGSGG\nGGGGGFG\nGGGGGGG",
      residents: [{ id: "ava", name: "Ava", position: { x: 3, y: 3 } }]
    });

    const world = simulation.snapshot().world;

    expect(world[2][2]).toEqual({ ground: "grass", stock: 100 });
    expect(world[4][4]).toEqual({ ground: "grass", stock: 100 });
    expect(world[1][1]).toEqual({ ground: "grass", stock: 100 });
    expect(world[5][5]).toEqual({ ground: "grass", stock: 100 });
  });

  it("moves an active resident by one field per work tick during daylight", () => {
    const simulation = SimulationEngine.start({
      map: "GGGGGGGGG\nGGGGGGGGG\nGGGGGGGGG\nGGGGGGGGG\nGGGGGGGGG",
      random: () => 0,
      residents: [{ id: "ari", name: "Ari", position: { x: 2, y: 2 } }]
    });

    simulation.advance();
    simulation.advance();
    simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 3, y: 2 },
      facing: "east"
    });
  });

  it("reaches a distant lake while exploring open terrain", () => {
    const simulation = SimulationEngine.start({
      map: `${"G".repeat(30)}W`,
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }]
    });

    for (let tick = 0; tick < 31; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 29, y: 0 },
      knownWaters: [{ x: 30, y: 0 }],
      activity: "fishing",
      activityTarget: { x: 30, y: 0 }
    });
  });

  it("publishes a 24-hour day and night rhythm", () => {
    const simulation = SimulationEngine.start({
      map: "GGG\nGGG\nGGG",
      residents: [{ id: "sol", name: "Sol", position: { x: 1, y: 1 } }]
    });

    simulation.advance();

    expect(simulation.snapshot().clock).toEqual({ day: 1, hour: 6, minute: 15, phase: "dawn" });

    for (let tick = 0; tick < 55; tick += 1) simulation.advance();

    expect(simulation.snapshot().clock).toEqual({ day: 1, hour: 20, minute: 0, phase: "night" });
  });

  it("fast-forwards night by one hour while daytime remains in quarter-hours", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{ id: "lui", name: "Lui", position: { x: 0, y: 0 } }]
    });

    for (let tick = 0; tick < 56; tick += 1) simulation.advance();
    simulation.advance();

    expect(simulation.snapshot().clock).toEqual({ day: 1, hour: 21, minute: 0, phase: "night" });
  });

  it("keeps night in quarter-hours while a resident is still returning home", () => {
    const simulation = SimulationEngine.start({
      map: "G".repeat(80),
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }]
    });

    for (let tick = 0; tick < 56; tick += 1) simulation.advance();

    const nightSnapshot = simulation.snapshot();
    expect(nightSnapshot.clock).toEqual({ day: 1, hour: 20, minute: 0, phase: "night" });
    expect(nightSnapshot.residents[0].state).toBe("returning");
    expect(nightSnapshot.residents[0].position.x).toBeGreaterThan(0);

    simulation.advance();

    expect(simulation.snapshot().clock).toEqual({ day: 1, hour: 20, minute: 15, phase: "night" });
  });

  it("keeps residents capable through a long workday and restores fitness overnight", () => {
    const simulation = SimulationEngine.start({
      map: "GGG",
      residents: [{ id: "lui", name: "Lui", position: { x: 1, y: 0 } }]
    });

    while (simulation.snapshot().clock.phase !== "dusk") simulation.advance();

    expect(simulation.snapshot().residents[0].fitness).toBeGreaterThan(0);

    while (simulation.snapshot().clock.day < 2 || simulation.snapshot().clock.hour < 6) simulation.advance();

    expect(simulation.snapshot().residents[0].fitness).toBeGreaterThan(75);
  });

  it("tracks hydration as part of survival", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 } }]
    });

    expect(simulation.snapshot().residents[0].hydration).toBe(100);
    simulation.advance();

    expect(simulation.snapshot().residents[0].hydration).toBeLessThan(100);
  });

  it("uses a meal before berries and only restores five fitness from a berry", () => {
    const berryOnly = SimulationEngine.start({
      map: "G",
      residents: [{ id: "bea", name: "Bea", position: { x: 0, y: 0 }, resources: ["berry"] }]
    });
    const mealAndBerry = SimulationEngine.start({
      map: "G",
      residents: [{ id: "noa", name: "Noa", position: { x: 0, y: 0 }, resources: ["meal", "berry"] }]
    });

    berryOnly.advance();
    berryOnly.advance();
    mealAndBerry.advance();
    mealAndBerry.advance();

    expect(berryOnly.snapshot().residents[0]).toMatchObject({ fitness: 75, inventory: { berries: 0 } });
    expect(mealAndBerry.snapshot().residents[0]).toMatchObject({ fitness: 95, inventory: { meals: 0, berries: 1 } });
  });

  it("remembers discovered fishing water and records discoveries and gathering in a resident log", () => {
    const simulation = SimulationEngine.start({
      map: "GGW\nGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }],
      random: () => 0
    });

    for (let tick = 0; tick < 4; tick += 1) simulation.advance();

    const resident = simulation.snapshot().residents[0];
    expect(resident).not.toHaveProperty("kind");
    expect(resident.knownWaters).toEqual([{ x: 2, y: 0 }]);
    expect(resident.knownTrees).toEqual([]);
    expect(resident.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: "Wasser bei 2/0 entdeckt." }),
      expect.objectContaining({
        message: "Fisch gefangen.",
        resourceChange: { action: "collected", kind: "fish", amount: 1 }
      })
    ]));
  });

  it("discovers water inside a three-patch semicircle ahead", () => {
    const simulation = SimulationEngine.start({
      map: "GGGGGGG\nGGGGGGG\nGGGGGGG\nGGGGGWG\nGGGGGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 3, y: 1 } }]
    });

    expect(simulation.snapshot().residents[0].knownWaters).toEqual([{ x: 5, y: 3 }]);
  });

  it("approaches a known water source before a competing berry bush", () => {
    const simulation = SimulationEngine.start({
      map: "GGGBGGG\nGGGGGGG\nGGGGGWG\nGGGGGGG\nGGGGGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 2, y: 2 } }],
      random: () => 0
    });

    simulation.advance();
    simulation.advance();
    simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 3, y: 2 },
      knownWaters: [{ x: 5, y: 2 }]
    });
  });

  it("keeps exploration direction stable regardless of action randomness", () => {
    const create = (random: () => number) => SimulationEngine.start({
      map: "GGGGGG\nGGGGGG\nGGGGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 1, y: 1 } }],
      random
    });
    const first = create(() => 0);
    const second = create(() => 1);
    for (let tick = 0; tick < 8; tick += 1) {
      first.advance();
      second.advance();
    }

    expect(first.snapshot().residents[0].position).toEqual(second.snapshot().residents[0].position);
  });

  it("replaces a farther remembered water source with one closer to home", () => {
    const simulation = SimulationEngine.start({
      map: "GGGGGGG\nGGGGGGG\nGGGGGGG\nGGGGGWG\nGGGGGGG\nGGGGGWG\nGGGWGGG",
      random: () => 0,
      residents: [{ id: "kai", name: "Kai", position: { x: 3, y: 3 }, resources: ["fish"] }]
    });

    for (let tick = 0; tick < 3; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0].knownWaters).toEqual([
      { x: 5, y: 3 },
      { x: 3, y: 6 }
    ]);
  });

  it("remembers a nearby berry bush as a food source", () => {
    const simulation = SimulationEngine.start({
      map: "GGG\nBGG",
      residents: [{ id: "bea", name: "Bea", position: { x: 1, y: 0 } }]
    });

    expect(simulation.snapshot().residents[0]).toMatchObject({
      knownBerryBushes: [{ x: 0, y: 1 }],
      log: expect.arrayContaining([expect.objectContaining({ message: "Beerenbusch bei 0/1 entdeckt." })])
    });
  });

  it("walks to a remembered berry bush to collect food", () => {
    const simulation = SimulationEngine.start({
      map: "GGG\nBGG",
      residents: [{ id: "bea", name: "Bea", position: { x: 1, y: 0 } }]
    });

    for (let tick = 0; tick < 3; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 1, y: 1 },
      facing: "west",
      activity: "harvesting",
      activityTarget: { x: 0, y: 1 }
    });
  });

  it("keeps a timestamped chronology of a resident's actions", () => {
    const simulation = SimulationEngine.start({
      map: "GGW\nGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }],
      random: () => 0
    });

    for (let tick = 0; tick < 4; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0].log).toEqual([
      { time: 1, day: 1, hour: 6, minute: 15, message: "Wacht auf." },
      { time: 2, day: 1, hour: 6, minute: 30, message: "Beginnt zu arbeiten." },
      { time: 3, day: 1, hour: 6, minute: 45, message: "Geht nach 1/0." },
      { time: 3, day: 1, hour: 6, minute: 45, message: "Wasser bei 2/0 entdeckt." },
      { time: 3, day: 1, hour: 6, minute: 45, message: "Beginnt zu fischen." },
      { time: 4, day: 1, hour: 7, minute: 0, message: "Fisch gefangen.", resourceChange: { action: "collected", kind: "fish", amount: 1 } }
    ]);
  });

  it("harvests berries from an adjacent berry bush without entering its patch", () => {
    const simulation = SimulationEngine.start({
      map: "GGB",
      residents: [{ id: "bea", name: "Bea", position: { x: 0, y: 0 } }],
      random: () => 1
    });

    for (let tick = 0; tick < 3; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 1, y: 0 },
      activity: "harvesting",
      activityTarget: { x: 2, y: 0 }
    });

    simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      inventory: { berries: 1 },
      log: expect.arrayContaining([expect.objectContaining({ message: "Beeren gesammelt." })])
    });
  });

  it("starts harvesting a berry bush directly north of the resident", () => {
    const simulation = SimulationEngine.start({
      map: "B\nG",
      residents: [{ id: "bea", name: "Bea", position: { x: 0, y: 1 } }],
      random: () => 0
    });

    for (let tick = 0; tick < 3; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      activity: "harvesting",
      activityTarget: { x: 0, y: 0 },
      facing: "north"
    });
  });

  it("limits remembered terrain sites while exploration continues", () => {
    const simulation = SimulationEngine.start({
      map: "GGGFGFGF\nGGGGGGGG\nGGGGGGGG\nGGWGWGWG",
      residents: [{ id: "eli", name: "Eli", position: { x: 0, y: 1 } }],
      random: () => 0
    });

    for (let tick = 0; tick < 360; tick += 1) simulation.advance();

    const resident = simulation.snapshot().residents[0];
    expect(resident.knownWaters).toHaveLength(2);
    expect(resident.knownTrees).toHaveLength(3);
    expect(resident.log.length).toBeGreaterThan(6);
  });

  it("keeps a resident on land and completes fishing over multiple ticks", () => {
    const simulation = SimulationEngine.start({
      map: "GGW\nGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }],
      random: () => 0
    });

    simulation.advance();
    simulation.advance();
    simulation.advance();

    expect(simulation.snapshot()).toMatchObject({
      residents: [{
        id: "kai",
        position: { x: 1, y: 0 },
        facing: "east",
        activity: "fishing",
        actionProgress: { completed: 1, required: 2 },
        inventory: { fish: 0 }
      }]
    });

    simulation.advance();

    const snapshot = simulation.snapshot();
    expect(snapshot.residents[0].inventory.fish).toBe(1);
    expect(snapshot.residents[0].activity).toBe("idle");
    expect(snapshot.world[0][2].stock).toBe(90);
  });

  it("can finish a fishing attempt without catching a fish", () => {
    const simulation = SimulationEngine.start({
      map: "GGW\nGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }],
      random: () => 1
    });

    for (let tick = 0; tick < 4; tick += 1) simulation.advance();

    const snapshot = simulation.snapshot();
    expect(snapshot.residents[0]).toMatchObject({
      activity: "idle",
      actionProgress: { completed: 0, required: 2 },
      inventory: { fish: 0 }
    });
    expect(snapshot.world[0][2].stock).toBe(100);
  });

  it("harvests a tree from an adjacent grass patch without entering the tree patch", () => {
    const simulation = SimulationEngine.start({
      map: "GGGF",
      residents: [{ id: "umi", name: "Umi", position: { x: 0, y: 0 } }],
      random: () => 0
    });

    for (let tick = 0; tick < 4; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 2, y: 0 },
      facing: "east",
      activity: "harvesting",
      activityTarget: { x: 3, y: 0 }
    });

    simulation.advance();

    const snapshot = simulation.snapshot();
    expect(snapshot.residents[0].inventory.wood).toBe(1);
    expect(snapshot.residents[0].inventory.plant).toBe(0);
    expect(snapshot.world[0][3]).toEqual({ ground: "forest", stock: 290 });
  });

  it("walks around a tree after harvesting it successfully", () => {
    const simulation = SimulationEngine.start({
      map: "GGGF\nGGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }],
      random: () => 1
    });

    for (let tick = 0; tick < 6; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 2, y: 1 },
      inventory: { wood: 1 }
    });
  });

  it("returns home by walking around a tree that blocks the direct route", () => {
    const simulation = SimulationEngine.start({
      map: "GGGFGGGG\nGGGGGWWW",
      residents: [{ id: "nia", name: "Nia", position: { x: 0, y: 0 }, resources: ["wood"] }],
      random: () => 1
    });

    for (let tick = 0; tick < 60; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      position: { x: 0, y: 0 },
      state: "sleeping",
      log: expect.arrayContaining([expect.objectContaining({ message: "Ist zuhause angekommen." })])
    });
  });

  it("discovers water beyond a tree it has temporarily bypassed", () => {
    const simulation = SimulationEngine.start({
      map: "GGGFW\nGGGGG",
      residents: [{ id: "kai", name: "Kai", position: { x: 0, y: 0 } }],
      random: () => 1
    });

    for (let tick = 0; tick < 12; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0].knownWaters).toEqual([{ x: 4, y: 0 }]);
  });

  it("cooks fish, wood, and a plant into a meal before eating", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{
        id: "lea",
        name: "Lea",
        position: { x: 0, y: 0 },
        resources: ["fish", "wood", "plant"]
      }]
    });

    simulation.advance();
    simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      satisfaction: 1,
      meals: 0,
      inventory: { fish: 0, wood: 0, plant: 0, meals: 0 }
    });
  });

  it("removes a fresh resource once its shelf life has passed", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{
        id: "iva",
        name: "Iva",
        position: { x: 0, y: 0 },
        resources: ["fish"]
      }],
      random: () => 1
    });

    while (
      simulation.snapshot().clock.day < 3 ||
      simulation.snapshot().clock.hour < 5
    ) simulation.advance();

    expect(simulation.snapshot().residents[0].homeInventory.fish).toBe(1);

    simulation.advance();

    expect(simulation.snapshot().residents[0].homeInventory.fish).toBe(0);
    expect(simulation.snapshot().residents[0].log).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: "Fisch ist verdorben." })
    ]));
  });

  it("does not harvest beyond a resident's carrying capacity", () => {
    const simulation = SimulationEngine.start({
      map: "GGW",
      residents: [{
        id: "noa",
        name: "Noa",
        position: { x: 0, y: 0 },
        resources: ["wood", "wood", "wood", "wood", "wood", "wood", "wood", "wood"]
      }],
      random: () => 0
    });

    simulation.advance();
    simulation.advance();
    simulation.advance();

    const snapshot = simulation.snapshot();
    expect(snapshot.residents[0].homeInventory).toMatchObject({ wood: 8, fish: 0 });
    expect(snapshot.world[0][2].stock).toBe(100);
  });

  it("rejects a resident that starts on water", () => {
    expect(() => SimulationEngine.start({
      map: "W",
      residents: [{ id: "rai", name: "Rai", position: { x: 0, y: 0 } }]
    })).toThrow("Residents must start on land");
  });

  it("stores carried resources in the resident's house at night", () => {
    const simulation = SimulationEngine.start({
      map: "G",
      residents: [{
        id: "zoe",
        name: "Zoe",
        position: { x: 0, y: 0 },
        resources: ["fish"]
      }],
      random: () => 1
    });

    for (let tick = 0; tick < 56; tick += 1) simulation.advance();

    expect(simulation.snapshot().residents[0]).toMatchObject({
      inventory: { fish: 0 },
      homeInventory: { fish: 1 }
    });
  });
});
