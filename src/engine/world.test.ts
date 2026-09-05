import { describe, expect, it } from "vitest";
import { IllegalMapSpecificationError, World } from "./world.js";

const enclosedLakeCount = (patches: { ground: string }[][], minimumSize: number): number => {
  const visited = new Set<string>();
  let lakes = 0;
  for (let y = 0; y < patches.length; y += 1) {
    for (let x = 0; x < patches[0].length; x += 1) {
      const key = `${x}/${y}`;
      if (patches[y][x].ground !== "water" || visited.has(key)) continue;
      const queue = [{ x, y }];
      let touchesOcean = false;
      let size = 0;
      while (queue.length > 0) {
        const current = queue.pop()!;
        const currentKey = `${current.x}/${current.y}`;
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);
        size += 1;
        touchesOcean ||= current.x === 0 || current.y === 0 || current.x === patches[0].length - 1 || current.y === patches.length - 1;
        [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].forEach((direction) => {
          const next = patches[current.y + direction.y]?.[current.x + direction.x];
          if (next?.ground === "water") queue.push({ x: current.x + direction.x, y: current.y + direction.y });
        });
      }
      if (!touchesOcean && size >= minimumSize) lakes += 1;
    }
  }
  return lakes;
};

describe("World", () => {
  it("creates an addressable map from a rectangular text map", () => {
    const world = World.fromAscii("WFG\nSFW");

    expect(world.dimensions()).toEqual({ width: 3, height: 2 });
    expect(world.patchAt({ x: 1, y: 0 })).toMatchObject({ ground: "forest", stock: 300 });
  });

  it("rejects a non-rectangular map before simulation begins", () => {
    expect(() => World.fromAscii("WF\nSFW")).toThrow(
      new IllegalMapSpecificationError("map not rectangular")
    );
  });

  it("exposes a readonly map snapshot for a visualizer", () => {
    const world = World.fromAscii("WS");

    expect(world.snapshot()).toEqual([
      [{ ground: "water", stock: 100 }, { ground: "sand", stock: 0 }]
    ]);
  });

  it("generates the same island from the same seed and keeps its outer border navigable water", () => {
    const first = World.generate({ width: 40, height: 24, seed: 729 });
    const second = World.generate({ width: 40, height: 24, seed: 729 });

    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.dimensions()).toEqual({ width: 40, height: 24 });
    expect(first.patchAt({ x: 0, y: 0 }).ground).toBe("water");
    expect(first.patchAt({ x: 39, y: 23 }).ground).toBe("water");
  });

  it("serializes a generated world into the map format used by simulations", () => {
    const original = World.generate({ width: 12, height: 8, seed: 11 });

    expect(World.fromAscii(original.toAscii()).snapshot()).toEqual(original.snapshot());
  });

  it("turns an available terrain stock into the matching gathered resource", () => {
    const world = World.fromAscii("F");

    expect(world.harvest({ x: 0, y: 0 })).toBe("wood");
    expect(world.patchAt({ x: 0, y: 0 }).stock).toBe(290);
  });

  it("treats a tree as a non-walkable, long-lived wood source that becomes grass once felled", () => {
    const world = World.fromAscii("F");

    expect(world.patchAt({ x: 0, y: 0 })).toEqual({ ground: "forest", stock: 300 });
    expect(world.isWalkable({ x: 0, y: 0 })).toBe(false);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(world.harvest({ x: 0, y: 0 })).toBe("wood");
    }

    expect(world.patchAt({ x: 0, y: 0 })).toEqual({ ground: "grass", stock: 100 });
  });

  it("treats a berry bush as a non-walkable source of berries", () => {
    const world = World.fromAscii("B");

    expect(world.patchAt({ x: 0, y: 0 })).toEqual({ ground: "berryBush", stock: 50 });
    expect(world.isWalkable({ x: 0, y: 0 })).toBe(false);
    expect(world.harvest({ x: 0, y: 0 })).toBe("berry");
  });

  it("protects a home and its surrounding fields from invalid terrain, trees, and harvesting", () => {
    const world = World.fromAscii(
      "GGGGGGG\nGFGGGGG\nGGWGGGG\nGGGGGGG\nGGGGSGG\nGGGGGFG\nGGGGGGG"
    );

    world.reserveHome({ x: 3, y: 3 });

    expect(world.patchAt({ x: 2, y: 2 })).toEqual({ ground: "grass", stock: 100 });
    expect(world.patchAt({ x: 4, y: 4 })).toEqual({ ground: "grass", stock: 100 });
    expect(world.patchAt({ x: 1, y: 1 })).toEqual({ ground: "grass", stock: 100 });
    expect(world.patchAt({ x: 5, y: 5 })).toEqual({ ground: "grass", stock: 100 });
    expect(world.harvest({ x: 3, y: 3 })).toBeUndefined();
    expect(world.harvest({ x: 3, y: 2 })).toBeUndefined();
    expect(world.harvest({ x: 3, y: 1 })).toBe("plant");
  });

  it("places at least one enclosed freshwater lake inside a large generated island", () => {
    const world = World.generate({ width: 160, height: 100, seed: 729 });
    expect(enclosedLakeCount(world.snapshot(), 15)).toBeGreaterThanOrEqual(3);
  });

  it("grows rare, individual trees only in clear land", () => {
    const patches = World.generate({ width: 80, height: 60, seed: 729 }).snapshot();
    const trees = patches.flatMap((row, y) => row.flatMap((patch, x) => patch.ground === "forest" ? [{ x, y }] : []));
    const landPatches = patches.flat().filter((patch) => patch.ground !== "water" && patch.ground !== "sand");

    expect(trees.length).toBeGreaterThan(0);
    expect(trees.length).toBeLessThan(landPatches.length * 0.1);
    trees.forEach(({ x, y }) => {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          expect(patches[y + offsetY]?.[x + offsetX]?.ground).not.toBe("forest");
        }
      }
    });
  });

  it("scatters visible berry bushes across generated grassland", () => {
    const patches = World.generate({ width: 80, height: 60, seed: 729 }).snapshot();
    const berryBushes = patches.flat().filter((patch) => patch.ground === "berryBush");

    expect(berryBushes.length).toBeGreaterThan(0);
    expect(berryBushes.every((patch) => patch.stock === 50)).toBe(true);
  });

  it("selects deterministic resident homes on grass only", () => {
    const world = World.generate({ width: 40, height: 24, seed: 729 });

    const homes = world.spawnPoints(4, 12345);
    const repeated = world.spawnPoints(4, 12345);

    expect(homes).toHaveLength(4);
    expect(homes).toEqual(repeated);
    expect(new Set(homes.map((home) => `${home.x}/${home.y}`)).size).toBe(4);
    homes.forEach((home) => expect(world.patchAt(home).ground).toBe("grass"));
  });
});
