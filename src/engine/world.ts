import { resourceForGround, type ResourceKind } from "./resources.js";

const TREE_STOCK = 300;
const BERRY_BUSH_STOCK = 50;
const TREE_GROWTH_CHANCE = 0.055;
const BERRY_BUSH_GROWTH_CHANCE = 0.03;

export type Ground = "water" | "forest" | "grass" | "sand" | "berryBush";

export interface GridPoint {
  x: number;
  y: number;
}

export interface Patch {
  ground: Ground;
  stock: number;
}

export interface WorldGenerationOptions {
  width: number;
  height: number;
  seed: number;
}

export class IllegalMapSpecificationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IllegalMapSpecificationError";
  }
}

export class World {
  private readonly patches: Patch[][];
  private readonly homes: GridPoint[] = [];

  private constructor(patches: Patch[][], homes: GridPoint[] = []) {
    this.patches = patches;
    this.homes.push(...homes.map((home) => ({ ...home })));
  }

  public static fromAscii(source: string): World {
    const lines = source.trim().split(/\r?\n/);
    if (lines.length === 0 || lines[0].length === 0) {
      throw new IllegalMapSpecificationError("map must not be empty");
    }

    const width = lines[0].length;
    if (lines.some((line) => line.length !== width)) {
      throw new IllegalMapSpecificationError("map not rectangular");
    }

    return new World(lines.map((line) => [...line].map(World.patchFor)));
  }

  public static fromSnapshot(snapshot: Patch[][], homes: GridPoint[] = []): World {
    if (snapshot.length === 0 || snapshot[0]?.length === 0 || snapshot.some((row) => row.length !== snapshot[0].length)) {
      throw new IllegalMapSpecificationError("world snapshot must be rectangular");
    }
    return new World(snapshot.map((row) => row.map((patch) => ({ ...patch }))), homes);
  }

  public static generate(options: WorldGenerationOptions): World {
    World.validateDimensions(options);
    const random = World.randomFrom(options.seed);
    const patches = World.createBasePatches(options, random);
    World.addLakes(patches, options, random);
    World.addTrees(patches, options, random);
    World.addBerryBushes(patches, options, random);
    return new World(patches);
  }

  private static validateDimensions(options: WorldGenerationOptions): void {
    if (options.width < 3 || options.height < 3) {
      throw new RangeError("A world must be at least 3 by 3 patches");
    }
  }

  private static createBasePatches(options: WorldGenerationOptions, random: () => number): Patch[][] {
    const centerX = (options.width - 1) / 2;
    const centerY = (options.height - 1) / 2;
    const patches: Patch[][] = Array.from({ length: options.height }, (_, y) =>
      Array.from({ length: options.width }, (_, x) => World.basePatchAt(x, y, options, centerX, centerY, random))
    );
    return patches;
  }

  private static basePatchAt(
    x: number,
    y: number,
    options: WorldGenerationOptions,
    centerX: number,
    centerY: number,
    random: () => number
  ): Patch {
    const distance = Math.hypot((x - centerX) / (options.width / 2), (y - centerY) / (options.height / 2));
    const coastline = 0.84 + random() * 0.16;
    if (x === 0 || y === 0 || x === options.width - 1 || y === options.height - 1 || distance > coastline) {
      return { ground: "water", stock: 100 };
    }
    if (distance > 0.74 || random() < 0.1) return { ground: "sand", stock: 0 };
    return { ground: "grass", stock: 100 };
  }

  private static addLakes(patches: Patch[][], options: WorldGenerationOptions, random: () => number): void {
    const lakeCount = options.width >= 9 && options.height >= 9
      ? Math.max(1, Math.floor(options.width * options.height / 3_000))
      : 0;
    for (let lake = 0; lake < lakeCount; lake += 1) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const x = 3 + Math.floor(random() * (options.width - 6));
        const y = 3 + Math.floor(random() * (options.height - 6));
        const lakeCoordinates = World.lakeCoordinates(x, y);
        if (!World.canPlaceLake(patches, lakeCoordinates)) continue;
        lakeCoordinates.forEach((point) => { patches[point.y][point.x] = { ground: "water", stock: 100 }; });
        World.clearSandAroundLake(patches, lakeCoordinates);
        break;
      }
    }
  }

  private static lakeCoordinates(centerX: number, centerY: number): GridPoint[] {
    return Array.from({ length: 7 }, (_, row) => row - 3)
      .flatMap((offsetY) => Array.from({ length: 7 }, (_, column) => column - 3)
        .filter((offsetX) => offsetX ** 2 + offsetY ** 2 <= 9)
        .map((offsetX) => ({ x: centerX + offsetX, y: centerY + offsetY })));
  }

  private static canPlaceLake(patches: Patch[][], coordinates: GridPoint[]): boolean {
    return coordinates.every((point) => patches[point.y]?.[point.x]?.ground === "grass");
  }

  private static clearSandAroundLake(patches: Patch[][], coordinates: GridPoint[]): void {
    coordinates.forEach((point) => {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighbour = patches[point.y + offsetY]?.[point.x + offsetX];
          if (neighbour?.ground === "sand") {
            neighbour.ground = "grass";
            neighbour.stock = 100;
          }
        }
      }
    });
  }

  private static addTrees(patches: Patch[][], options: WorldGenerationOptions, random: () => number): void {
    for (const y of World.interiorCoordinates(options.height)) {
      for (const x of World.interiorCoordinates(options.width)) {
        if (patches[y][x].ground !== "grass" || random() >= TREE_GROWTH_CHANCE) continue;
        const hasNeighbouringTree = World.hasNeighbouringTree(patches, x, y);
        if (!hasNeighbouringTree) patches[y][x] = { ground: "forest", stock: TREE_STOCK };
      }
    }
  }

  private static addBerryBushes(patches: Patch[][], options: WorldGenerationOptions, random: () => number): void {
    for (const y of World.interiorCoordinates(options.height)) {
      for (const x of World.interiorCoordinates(options.width)) {
        if (patches[y][x].ground === "grass" && random() < BERRY_BUSH_GROWTH_CHANCE) {
          patches[y][x] = { ground: "berryBush", stock: BERRY_BUSH_STOCK };
        }
      }
    }
  }

  private static interiorCoordinates(dimension: number): number[] {
    return Array.from({ length: dimension - 2 }, (_, index) => index + 1);
  }

  private static hasNeighbouringTree(patches: Patch[][], x: number, y: number): boolean {
    return [-1, 0, 1].some((offsetY) => [-1, 0, 1].some((offsetX) =>
      (offsetX !== 0 || offsetY !== 0) && patches[y + offsetY][x + offsetX].ground === "forest"
    ));
  }

  public dimensions(): { width: number; height: number } {
    return { width: this.patches[0].length, height: this.patches.length };
  }

  public patchAt(point: GridPoint): Patch {
    const patch = this.patches[point.y]?.[point.x];
    if (patch === undefined) {
      throw new RangeError(`No patch at ${point.x}/${point.y}`);
    }
    return { ...patch };
  }

  public reserveHome(home: GridPoint): void {
    this.patchAt(home);
    if (this.homes.some((existingHome) => existingHome.x === home.x && existingHome.y === home.y)) return;

    this.homes.push({ ...home });
    this.forEachPatchNear(home, 2, (patch) => {
      if (patch.ground === "forest") this.makeGrass(patch);
    });
    this.forEachPatchNear(home, 1, (patch) => {
      if (patch.ground === "water" || patch.ground === "sand") this.makeGrass(patch);
    });
  }

  public harvest(point: GridPoint): ResourceKind | undefined {
    const patch = this.patches[point.y]?.[point.x];
    if (patch === undefined || patch.stock < 10) return undefined;
    const resource = resourceForGround(patch.ground);
    if (resource === undefined) return undefined;
    if (this.isHome(point) || (resource === "plant" && this.isNearHome(point, 1))) return undefined;
    patch.stock -= 10;
    if ((patch.ground === "forest" || patch.ground === "berryBush") && patch.stock === 0) {
      patch.ground = "grass";
      patch.stock = 100;
    }
    return resource;
  }

  public isWalkable(point: GridPoint): boolean {
    const ground = this.patches[point.y]?.[point.x]?.ground;
    return ground !== undefined && ground !== "water" && ground !== "forest" && ground !== "berryBush";
  }

  /** Returns unique, deterministic home candidates on clear grassland. */
  public spawnPoints(count: number, seed: number): GridPoint[] {
    if (!Number.isInteger(count) || count < 0) throw new RangeError("Spawn count must be a non-negative integer");
    const candidates = this.patches.flatMap((row, y) => row.flatMap((patch, x) =>
      patch.ground === "grass" ? [{ x, y }] : []
    ));
    const random = World.randomFrom(seed);
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }
    return candidates.slice(0, count).map((point) => ({ ...point }));
  }

  public snapshot(): Patch[][] {
    return this.patches.map((row) => row.map((patch) => ({ ...patch })));
  }

  public toAscii(): string {
    const symbolByGround: Record<Ground, string> = {
      water: "W",
      forest: "F",
      grass: "G",
      sand: "S",
      berryBush: "B"
    };
    return this.patches.map((row) => row.map((patch) => symbolByGround[patch.ground]).join("")).join("\n");
  }

  private forEachPatchNear(home: GridPoint, radius: number, operation: (patch: Patch) => void): void {
    for (let y = Math.max(0, home.y - radius); y <= Math.min(this.patches.length - 1, home.y + radius); y += 1) {
      for (let x = Math.max(0, home.x - radius); x <= Math.min(this.patches[0].length - 1, home.x + radius); x += 1) {
        operation(this.patches[y][x]);
      }
    }
  }

  private makeGrass(patch: Patch): void {
    patch.ground = "grass";
    patch.stock = 100;
  }

  private isHome(point: GridPoint): boolean {
    return this.homes.some((home) => home.x === point.x && home.y === point.y);
  }

  private isNearHome(point: GridPoint, radius: number): boolean {
    return this.homes.some((home) =>
      Math.max(Math.abs(point.x - home.x), Math.abs(point.y - home.y)) <= radius
    );
  }

  private static patchFor(symbol: string): Patch {
    const groundBySymbol: Record<string, Ground> = {
      W: "water",
      F: "forest",
      G: "grass",
      S: "sand",
      B: "berryBush"
    };
    const ground = groundBySymbol[symbol];
    if (ground === undefined) {
      throw new IllegalMapSpecificationError("illegal character in map");
    }
    return { ground, stock: World.stockFor(ground) };
  }

  private static stockFor(ground: Ground): number {
    if (ground === "forest") return TREE_STOCK;
    if (ground === "berryBush") return BERRY_BUSH_STOCK;
    if (ground === "sand") return 0;
    return 100;
  }

  private static randomFrom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
  }
}
