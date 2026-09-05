import { type GridPoint, type Patch, World } from "./world.js";
import { carryingCapacity, shelfLifeHours, type ResourceKind } from "./resources.js";

const MINUTES_PER_TICK = 15;
const PATCHES_PER_TICK = 1;
const START_OF_DAY_MINUTES = 6 * 60;
const ACTION_TICKS_REQUIRED = 2;
const RESOURCE_ACTION_SUCCESS_CHANCE = 0.65;
const FITNESS_WORK_COST = 0.75;
const NIGHT_FITNESS_RECOVERY = 2;
const WAKE_FITNESS_RECOVERY = 0;
const MEAL_FITNESS_RECOVERY = 25;
const BERRY_FITNESS_RECOVERY = 5;
const MIN_FITNESS_FOR_WORK = 20;
const MAX_KNOWN_WATERS = 2;
const MAX_KNOWN_TREES = 3;
const MAX_KNOWN_BERRY_BUSHES = 3;
const RESOURCE_BYPASS_TICKS = 2;
const RESOURCE_VISION_RADIUS = 3;
const CARDINAL_DIRECTIONS: GridPoint[] = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }
];

export type ResidentState = "sleeping" | "eating" | "working" | "returning" | "dead";
export type DayPhase = "dawn" | "day" | "dusk" | "night";
export type Direction = "north" | "east" | "south" | "west";
export type ResidentActivity = "idle" | "harvesting" | "fishing";

export interface ResidentSeed {
  id: string;
  name: string;
  position: GridPoint;
  resources?: ResourceKind[];
}

export interface SimulationStartOptions {
  map: string;
  residents: ResidentSeed[];
  random?: () => number;
}

export interface InventorySnapshot {
  fish: number;
  wood: number;
  plant: number;
  berries: number;
  meals: number;
}

export interface ResidentLogEntry {
  time: number;
  day: number;
  hour: number;
  minute: number;
  message: string;
}

export interface ResidentSnapshot extends ResidentSeed {
  home: GridPoint;
  homeInventory: InventorySnapshot;
  facing: Direction;
  activity: ResidentActivity;
  activityTarget?: GridPoint;
  actionProgress: { completed: number; required: number };
  state: ResidentState;
  fitness: number;
  hunger: number;
  health: number;
  meals: number;
  inventory: InventorySnapshot;
  satisfaction: number;
  knownWaters: GridPoint[];
  knownTrees: GridPoint[];
  knownBerryBushes: GridPoint[];
  log: ResidentLogEntry[];
}

export interface SimulationSnapshot {
  time: number;
  clock: SimulationClock;
  world: Patch[][];
  residents: ResidentSnapshot[];
}

export interface SimulationClock {
  day: number;
  hour: number;
  minute: number;
  phase: DayPhase;
}

interface Resident extends ResidentSnapshot {
  items: StoredResource[];
  homeItems: StoredResource[];
  home: GridPoint;
  explored: Set<string>;
  avoidedResources: Map<string, number>;
}

interface StoredResource {
  kind: ResourceKind;
  collectedAt: number;
}

export class SimulationEngine {
  private time = 0;
  private elapsedMinutes = START_OF_DAY_MINUTES;
  private readonly world: World;
  private readonly residents: Resident[];
  private readonly random: () => number;

  private constructor(world: World, residents: Resident[], random: () => number) {
    this.world = world;
    this.residents = residents;
    this.random = random;
  }

  public static start(options: SimulationStartOptions): SimulationEngine {
    const world = World.fromAscii(options.map);
    options.residents.forEach((resident) => {
      if (!world.isWalkable(resident.position)) {
        throw new RangeError("Residents must start on land");
      }
    });
    options.residents.forEach((resident) => world.reserveHome(resident.position));
    const residents = options.residents.map((resident) => {
      const items = (resident.resources ?? []).map((kind) => ({ kind, collectedAt: START_OF_DAY_MINUTES }));
      return {
        id: resident.id,
        name: resident.name,
        ...(resident.resources === undefined ? {} : { resources: [...resident.resources] }),
        position: { ...resident.position },
        home: { ...resident.position },
        homeInventory: SimulationEngine.emptyInventory(),
        facing: "south" as const,
        activity: "idle" as const,
        actionProgress: { completed: 0, required: ACTION_TICKS_REQUIRED },
        state: "sleeping" as const,
        fitness: 70,
        hunger: 30,
        health: 100,
        meals: items.filter((item) => item.kind === "meal").length,
        inventory: SimulationEngine.inventoryFor(items),
        items,
        homeItems: [],
        satisfaction: 0,
        knownWaters: [],
        knownTrees: [],
        knownBerryBushes: [],
        log: [],
        explored: new Set([SimulationEngine.pointKey(resident.position)]),
        avoidedResources: new Map()
      };
    });
    const simulation = new SimulationEngine(world, residents, options.random ?? Math.random);
    simulation.residents.forEach((resident) => simulation.discoverNearbyResources(resident));
    return simulation;
  }

  public advance(): void {
    const canFastForwardNight =
      this.clock().phase === "night" && this.residents.every((resident) => resident.state === "sleeping" || resident.state === "dead");
    const minutesToAdvance = canFastForwardNight ? 60 : MINUTES_PER_TICK;
    this.time += 1;
    for (let minutes = 0; minutes < minutesToAdvance; minutes += MINUTES_PER_TICK) {
      this.elapsedMinutes += MINUTES_PER_TICK;
      const clock = this.clock();
      this.residents.forEach((resident) => {
        this.discardSpoiledResources(resident);
        this.advanceResident(resident, clock);
      });
    }
  }

  public donateMeal(residentId: string): void {
    const resident = this.findResident(residentId);
    resident.items.push({ kind: "meal", collectedAt: this.elapsedMinutes });
    this.syncInventory(resident);
    this.appendLog(resident, "Mahlzeit erhalten.");
  }

  public snapshot(): SimulationSnapshot {
    return {
      time: this.time,
      clock: this.clock(),
      world: this.world.snapshot(),
      residents: this.residents.map((resident) => ({
        id: resident.id,
        name: resident.name,
        ...(resident.resources === undefined ? {} : { resources: [...resident.resources] }),
        position: { ...resident.position },
        home: { ...resident.home },
        activityTarget: resident.activityTarget === undefined ? undefined : { ...resident.activityTarget },
        inventory: { ...resident.inventory },
        homeInventory: { ...resident.homeInventory },
        facing: resident.facing,
        activity: resident.activity,
        actionProgress: { ...resident.actionProgress },
        state: resident.state,
        fitness: resident.fitness,
        hunger: resident.hunger,
        health: resident.health,
        meals: resident.meals,
        satisfaction: resident.satisfaction,
        knownWaters: resident.knownWaters.map((point) => ({ ...point })),
        knownTrees: resident.knownTrees.map((point) => ({ ...point })),
        knownBerryBushes: resident.knownBerryBushes.map((point) => ({ ...point })),
        log: resident.log.map((entry) => ({ ...entry }))
      }))
    };
  }

  private advanceResident(resident: Resident, clock: SimulationClock): void {
    if (resident.state === "dead") return;
    const previousHunger = resident.hunger;
    resident.hunger = Math.min(100, resident.hunger + (clock.phase === "night" ? 0.2 : 0.8));
    if (previousHunger < 50 && resident.hunger >= 50) this.appendLog(resident, "Hat Hunger und sucht Nahrung.");
    if (previousHunger < 100 && resident.hunger === 100) this.appendLog(resident, "Verhungert: Gesundheit sinkt ohne Nahrung.");
    if (resident.hunger >= 100) resident.health = Math.max(0, resident.health - 1.5);
    else if (resident.hunger < 50 && resident.state === "sleeping") resident.health = Math.min(100, resident.health + 0.5);
    if (resident.fitness <= 0 && resident.state !== "sleeping") resident.health = Math.max(0, resident.health - 0.5);
    if (resident.health === 0) {
      this.cancelAction(resident);
      resident.state = "dead";
      this.appendLog(resident, "Ist gestorben.");
      return;
    }
    if (resident.hunger >= 50 && this.eatAvailableFood(resident)) {
      this.cancelAction(resident);
      return;
    }
    if (this.atHome(resident) && resident.state === "returning") {
      this.storeAtHome(resident);
      if (this.cookIfPossible(resident)) this.appendLog(resident, "Mahlzeit gekocht.");
      resident.state = "sleeping";
    }
    if (clock.phase === "night") {
      this.cancelAction(resident);
      if (!this.atHome(resident)) {
        if (resident.state !== "returning") this.appendLog(resident, "Kehrt nach Hause zurück.");
        resident.state = "returning";
        this.moveTowardsHome(resident);
        return;
      }
      this.storeAtHome(resident);
      resident.state = "sleeping";
      this.recoverFitness(resident, NIGHT_FITNESS_RECOVERY);
      return;
    }
    if (resident.state === "sleeping") {
      if (clock.phase === "dusk" || resident.fitness < 60) {
        this.recoverFitness(resident, NIGHT_FITNESS_RECOVERY);
        return;
      }
      this.recoverFitness(resident, WAKE_FITNESS_RECOVERY);
      resident.state = "eating";
      this.appendLog(resident, "Wacht auf.");
      return;
    }
    if (resident.state === "eating") {
      if (this.cookIfPossible(resident)) this.appendLog(resident, "Mahlzeit gekocht.");
      this.eatAvailableFood(resident);
      this.packProvisions(resident);
      resident.state = "working";
      this.appendLog(resident, "Beginnt zu arbeiten.");
      return;
    }
    const readyToCook = ["fish", "wood", "plant"].every((kind) => this.hasResource(resident, kind as ResourceKind));
    if (resident.state === "working" && (clock.phase === "dusk" || resident.fitness < MIN_FITNESS_FOR_WORK + this.distanceFromHome(resident, resident.position) * 0.4 || resident.items.length >= carryingCapacity || readyToCook)) {
      this.cancelAction(resident);
      resident.state = "returning";
      this.appendLog(resident, "Kehrt nach Hause zurück.");
      return;
    }
    if (resident.state === "returning") {
      this.moveTowardsHome(resident);
      if (this.atHome(resident)) resident.state = "sleeping";
      return;
    }
    if (resident.activity === "idle") {
      this.moveForWork(resident);
      this.startResourceAction(resident);
    } else {
      this.continueResourceAction(resident);
    }
    resident.fitness = Math.max(0, resident.fitness - FITNESS_WORK_COST);
  }

  private startResourceAction(resident: Resident): void {
    if (resident.items.length >= carryingCapacity) return;
    const ahead = this.pointAhead(resident);
    if (ahead === undefined || !this.needsResourceAt(resident, ahead)) return;
    const target = ahead;
    const patch = this.world.patchAt(target);
    if (patch.stock <= 0) return;
    resident.activity = patch.ground === "water" ? "fishing" : "harvesting";
    resident.activityTarget = { ...target };
    resident.actionProgress = { completed: 1, required: ACTION_TICKS_REQUIRED };
    this.appendLog(resident, resident.activity === "fishing" ? "Beginnt zu fischen." : "Beginnt zu ernten.");
  }

  private continueResourceAction(resident: Resident): void {
    const completed = resident.actionProgress.completed + 1;
    if (completed < ACTION_TICKS_REQUIRED) {
      resident.actionProgress = { completed, required: ACTION_TICKS_REQUIRED };
      return;
    }
    const target = resident.activityTarget;
    const actionSucceeds = resident.activity !== "fishing" || this.random() < RESOURCE_ACTION_SUCCESS_CHANCE;
    const resource = target !== undefined && actionSucceeds
      ? this.world.harvest(target)
      : undefined;
    if (resource !== undefined) {
      resident.items.push({ kind: resource, collectedAt: this.elapsedMinutes });
      this.syncInventory(resident);
      this.appendLog(resident, this.gatheringMessage(resource));
      this.discoverNearbyResources(resident);
    } else {
      if (target !== undefined && !this.world.isWalkable(target)) {
        resident.avoidedResources.set(SimulationEngine.pointKey(target), this.time + RESOURCE_BYPASS_TICKS);
      }
      this.appendLog(resident, resident.activity === "fishing" ? "Fangversuch fehlgeschlagen." : "Ernteversuch fehlgeschlagen.");
    }
    this.cancelAction(resident);
  }

  private cancelAction(resident: Resident): void {
    resident.activity = "idle";
    resident.activityTarget = undefined;
    resident.actionProgress = { completed: 0, required: ACTION_TICKS_REQUIRED };
  }

  private cookIfPossible(resident: Resident): boolean {
    if (!this.atHome(resident)) return false;
    this.storeAtHome(resident);
    const storage = resident.homeItems.length > 0 ? resident.homeItems : resident.items;
    const ingredients = ["fish", "wood", "plant"] as const;
    const selected = new Set(ingredients.map((kind) => this.oldest(storage, kind)));
    if (selected.has(undefined)) return false;
    const cooked = { kind: "meal" as const, collectedAt: this.elapsedMinutes };
    if (storage === resident.homeItems) {
      resident.homeItems = resident.homeItems.filter((item) => !selected.has(item));
      resident.homeItems.push(cooked);
      this.syncHomeInventory(resident);
    } else {
      resident.items = resident.items.filter((item) => !selected.has(item));
      resident.items.push(cooked);
      this.syncInventory(resident);
    }
    return true;
  }

  private discardSpoiledResources(resident: Resident): void {
    const isUsable = (item: StoredResource): boolean => this.elapsedMinutes - item.collectedAt < shelfLifeHours[item.kind] * 60;
    resident.items = resident.items.filter(isUsable);
    resident.homeItems = resident.homeItems.filter(isUsable);
    this.syncInventory(resident);
    this.syncHomeInventory(resident);
  }

  private consumeOldest(resident: Resident, kind: ResourceKind): boolean {
    const storage = this.atHome(resident) && resident.homeItems.some((item) => item.kind === kind) ? resident.homeItems : resident.items;
    const resource = this.oldest(storage, kind);
    if (resource === undefined) return false;
    if (storage === resident.homeItems) {
      resident.homeItems = resident.homeItems.filter((item) => item !== resource);
      this.syncHomeInventory(resident);
    } else {
      resident.items = resident.items.filter((item) => item !== resource);
      this.syncInventory(resident);
    }
    return true;
  }

  private oldest(items: StoredResource[], kind: ResourceKind): StoredResource | undefined {
    return items
      .filter((item) => item.kind === kind)
      .sort((left, right) => left.collectedAt - right.collectedAt)[0];
  }

  private eatAvailableFood(resident: Resident): boolean {
    if (resident.hunger < 30) return false;
    if (this.atHome(resident) && this.cookIfPossible(resident)) this.appendLog(resident, "Mahlzeit gekocht.");
    if (this.consumeOldest(resident, "meal")) {
      resident.hunger = 0;
      this.recoverFitness(resident, MEAL_FITNESS_RECOVERY);
      resident.satisfaction += 1;
      this.appendLog(resident, "Mahlzeit gegessen (vollständig satt).");
      return true;
    }
    if (this.consumeOldest(resident, "berry")) {
      resident.hunger = Math.max(0, resident.hunger - 15);
      this.recoverFitness(resident, BERRY_FITNESS_RECOVERY);
      this.appendLog(resident, "Beere gegessen (−15 Hunger).");
      return true;
    }
    return false;
  }

  private packProvisions(resident: Resident): void {
    if (!this.atHome(resident)) return;
    for (const kind of ["meal", "berry"] as const) {
      for (let count = 0; count < 2 && resident.items.length < carryingCapacity; count += 1) {
        const item = this.oldest(resident.homeItems, kind);
        if (item === undefined) break;
        resident.homeItems = resident.homeItems.filter((stored) => stored !== item);
        resident.items.push(item);
      }
    }
    this.syncHomeInventory(resident);
    this.syncInventory(resident);
  }

  private clock(): SimulationClock {
    const minuteOfDay = this.elapsedMinutes % (24 * 60);
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    return { day: Math.floor(this.elapsedMinutes / (24 * 60)) + 1, hour, minute, phase: this.phaseFor(hour) };
  }

  private phaseFor(hour: number): DayPhase {
    if (hour < 6) return "night";
    if (hour < 8) return "dawn";
    if (hour < 18) return "day";
    if (hour < 20) return "dusk";
    return "night";
  }

  private moveForWork(resident: Resident): void {
    this.discoverNearbyResources(resident);
    if (this.moveTowardsKnownResource(resident)) return;
    const dimensions = this.world.dimensions();
    for (let step = 0; step < PATCHES_PER_TICK; step += 1) {
      const candidates = CARDINAL_DIRECTIONS;
      const resourceDirection = candidates.find(({ x, y }) => {
        const target = { x: resident.position.x + x, y: resident.position.y + y };
        return this.isInside(target, dimensions) && !this.world.isWalkable(target) && this.needsResourceAt(resident, target);
      });
      if (resourceDirection !== undefined) {
        resident.facing = this.directionFor(resourceDirection);
        return;
      }
      const explorationDirections = this.explorationDirections();
      const direction = explorationDirections.find(({ x, y }) => {
        const candidate = { x: resident.position.x + x, y: resident.position.y + y };
        return this.world.isWalkable(candidate) && !resident.explored.has(SimulationEngine.pointKey(candidate));
      }) ?? this.explorationStep(resident, explorationDirections);
      if (direction === undefined) return;
      this.move(resident, direction);
      this.discoverNearbyResources(resident);
    }
  }

  private moveTowardsKnownResource(resident: Resident): boolean {
    if (resident.items.length >= carryingCapacity) return false;
    const desiredResources: GridPoint[][] = [];
    if (resident.hunger >= 50 && !resident.items.some((item) => item.kind === "berry" || item.kind === "meal")) desiredResources.push(this.availableKnownResources(resident, resident.knownBerryBushes, "berryBush"));
    if (!this.hasResource(resident, "fish")) desiredResources.push(this.availableKnownResources(resident, resident.knownWaters, "water"));
    if (!this.hasResource(resident, "wood")) desiredResources.push(this.availableKnownResources(resident, resident.knownTrees, "forest"));
    if (!this.hasResource(resident, "berry")) desiredResources.push(this.availableKnownResources(resident, resident.knownBerryBushes, "berryBush"));

    for (const resources of desiredResources) {
      const adjacentResource = resources.find((resource) => this.isAdjacent(resident.position, resource));
      if (adjacentResource !== undefined) {
        resident.facing = this.directionFor({
          x: adjacentResource.x - resident.position.x,
          y: adjacentResource.y - resident.position.y
        });
        return true;
      }
      const approaches = resources.flatMap((resource) => this.resourceApproaches(resource));
      const movement = this.firstStepToAny(resident.position, approaches);
      if (movement !== undefined) {
        this.move(resident, movement);
        const newlyAdjacentResource = resources.find((resource) => this.isAdjacent(resident.position, resource));
        if (newlyAdjacentResource !== undefined) {
          resident.facing = this.directionFor({
            x: newlyAdjacentResource.x - resident.position.x,
            y: newlyAdjacentResource.y - resident.position.y
          });
        }
        this.discoverNearbyResources(resident);
        return true;
      }
    }
    return false;
  }

  private explorationDirections(): GridPoint[] {
    const offset = Math.min(CARDINAL_DIRECTIONS.length - 1, Math.floor(this.random() * CARDINAL_DIRECTIONS.length));
    return [...CARDINAL_DIRECTIONS.slice(offset), ...CARDINAL_DIRECTIONS.slice(0, offset)];
  }

  private explorationStep(resident: Resident, directions: GridPoint[]): GridPoint | undefined {
    const frontier: GridPoint[] = [];
    for (const key of resident.explored) {
      const [x, y] = key.split("/").map(Number);
      for (const direction of directions) {
        const point = { x: x + direction.x, y: y + direction.y };
        if (!resident.explored.has(SimulationEngine.pointKey(point)) && this.world.isWalkable(point)) frontier.push(point);
      }
    }
    return this.firstStepToAny(resident.position, frontier, directions);
  }

  private discoverNearbyResources(resident: Resident): void {
    resident.knownTrees = resident.knownTrees.filter((point) => this.world.patchAt(point).ground === "forest");
    resident.knownBerryBushes = resident.knownBerryBushes.filter((point) => this.world.patchAt(point).ground === "berryBush");
    for (const point of this.resourcePointsInSight(resident)) {
      const ground = this.world.patchAt(point).ground;
      if (ground === "water") {
        this.rememberResource(resident, resident.knownWaters, MAX_KNOWN_WATERS, point, "Wasser");
      }
      if (ground === "forest") {
        this.rememberResource(resident, resident.knownTrees, MAX_KNOWN_TREES, point, "Baum");
      }
      if (ground === "berryBush") {
        this.rememberResource(resident, resident.knownBerryBushes, MAX_KNOWN_BERRY_BUSHES, point, "Beerenbusch");
      }
    }
  }

  private resourcePointsInSight(resident: Resident): GridPoint[] {
    const forward = this.facingOffset(resident.facing);
    const points: GridPoint[] = [];
    for (let y = -RESOURCE_VISION_RADIUS; y <= RESOURCE_VISION_RADIUS; y += 1) {
      for (let x = -RESOURCE_VISION_RADIUS; x <= RESOURCE_VISION_RADIUS; x += 1) {
        const distanceSquared = x * x + y * y;
        if (distanceSquared === 0 || distanceSquared > RESOURCE_VISION_RADIUS * RESOURCE_VISION_RADIUS) continue;
        if (x * forward.x + y * forward.y <= 0) continue;
        const point = { x: resident.position.x + x, y: resident.position.y + y };
        if (this.isInside(point, this.world.dimensions())) points.push(point);
      }
    }
    return points;
  }

  private rememberResource(
    resident: Resident,
    memory: GridPoint[],
    limit: number,
    point: GridPoint,
    label: string
  ): void {
    if (memory.some((known) => SimulationEngine.samePoint(known, point))) return;
    if (memory.length < limit) {
      memory.push({ ...point });
    } else {
      const farthestIndex = memory.reduce((farthest, known, index) =>
        this.distanceFromHome(resident, known) > this.distanceFromHome(resident, memory[farthest]) ? index : farthest, 0);
      if (this.distanceFromHome(resident, point) >= this.distanceFromHome(resident, memory[farthestIndex])) return;
      memory[farthestIndex] = { ...point };
    }
    this.appendLog(resident, `${label} bei ${point.x}/${point.y} entdeckt.`);
  }

  private distanceFromHome(resident: Resident, point: GridPoint): number {
    return Math.abs(point.x - resident.home.x) + Math.abs(point.y - resident.home.y);
  }

  private availableKnownResources(resident: Resident, points: GridPoint[], ground: "water" | "forest" | "berryBush"): GridPoint[] {
    return points.filter((point) => {
      const patch = this.world.patchAt(point);
      return patch.ground === ground && patch.stock >= 10 && !this.isAvoidingResource(resident, point);
    });
  }

  private resourceApproaches(resource: GridPoint): GridPoint[] {
    return CARDINAL_DIRECTIONS
      .map((direction) => ({ x: resource.x + direction.x, y: resource.y + direction.y }))
      .filter((point) => this.isInside(point, this.world.dimensions()) && this.world.isWalkable(point));
  }

  private firstStepToAny(start: GridPoint, targets: GridPoint[], directions = CARDINAL_DIRECTIONS): GridPoint | undefined {
    const targetKeys = new Set(targets.map(SimulationEngine.pointKey));
    if (targetKeys.size === 0 || targetKeys.has(SimulationEngine.pointKey(start))) return undefined;
    const queue: Array<{ point: GridPoint; firstStep: GridPoint }> = [];
    const visited = new Set([SimulationEngine.pointKey(start)]);
    for (const direction of directions) {
      const point = { x: start.x + direction.x, y: start.y + direction.y };
      if (!this.world.isWalkable(point)) continue;
      const key = SimulationEngine.pointKey(point);
      if (targetKeys.has(key)) return direction;
      visited.add(key);
      queue.push({ point, firstStep: direction });
    }
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const direction of directions) {
        const point = { x: current.point.x + direction.x, y: current.point.y + direction.y };
        const key = SimulationEngine.pointKey(point);
        if (visited.has(key) || !this.world.isWalkable(point)) continue;
        if (targetKeys.has(key)) return current.firstStep;
        visited.add(key);
        queue.push({ point, firstStep: current.firstStep });
      }
    }
    return undefined;
  }

  private hasResource(resident: Resident, kind: ResourceKind): boolean {
    return resident.items.some((item) => item.kind === kind) || resident.homeItems.some((item) => item.kind === kind);
  }

  private needsResourceAt(resident: Resident, point: GridPoint): boolean {
    if (this.isAvoidingResource(resident, point)) return false;
    const patch = this.world.patchAt(point);
    if (patch.stock < 10) return false;
    const ground = patch.ground;
    if (ground === "water") return !this.hasResource(resident, "fish");
    if (ground === "forest") return !this.hasResource(resident, "wood");
    if (ground === "berryBush") return !this.hasResource(resident, "berry");
    if (ground === "grass") return !this.hasResource(resident, "plant") && this.hasResource(resident, "fish") && this.hasResource(resident, "wood");
    return false;
  }

  private isAvoidingResource(resident: Resident, point: GridPoint): boolean {
    const key = SimulationEngine.pointKey(point);
    const until = resident.avoidedResources.get(key);
    if (until === undefined) return false;
    if (this.time <= until) return true;
    resident.avoidedResources.delete(key);
    return false;
  }

  private isAdjacent(left: GridPoint, right: GridPoint): boolean {
    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
  }

  private move(resident: Resident, movement: GridPoint): void {
    resident.fitness = Math.max(0, resident.fitness - 0.4);
    resident.position = { x: resident.position.x + movement.x, y: resident.position.y + movement.y };
    resident.facing = this.directionFor(movement);
    resident.explored.add(SimulationEngine.pointKey(resident.position));
    this.appendLog(resident, `Geht nach ${resident.position.x}/${resident.position.y}.`);
  }

  private moveTowardsHome(resident: Resident): void {
    for (let step = 0; step < PATCHES_PER_TICK && !this.atHome(resident); step += 1) {
      const movement = this.firstStepToAny(resident.position, [resident.home]);
      if (movement === undefined) return;
      this.move(resident, movement);
      if (this.atHome(resident)) this.appendLog(resident, "Ist zuhause angekommen.");
    }
  }

  private pointAhead(resident: Resident): GridPoint | undefined {
    const direction = this.facingOffset(resident.facing);
    const ahead = { x: resident.position.x + direction.x, y: resident.position.y + direction.y };
    return this.isInside(ahead, this.world.dimensions()) ? ahead : undefined;
  }

  private facingOffset(facing: Direction): GridPoint {
    const directions: Record<Direction, GridPoint> = {
      north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 }
    };
    return directions[facing];
  }

  private isInside(point: GridPoint, dimensions: { width: number; height: number }): boolean {
    return point.x >= 0 && point.y >= 0 && point.x < dimensions.width && point.y < dimensions.height;
  }

  private directionFor(movement: GridPoint): Direction {
    if (movement.x > 0) return "east";
    if (movement.x < 0) return "west";
    if (movement.y > 0) return "south";
    return "north";
  }

  private atHome(resident: Resident): boolean {
    return resident.position.x === resident.home.x && resident.position.y === resident.home.y;
  }

  private recoverFitness(resident: Resident, amount: number): void {
    resident.fitness = Math.min(100, resident.fitness + amount);
  }

  private syncInventory(resident: Resident): void {
    resident.inventory = SimulationEngine.inventoryFor(resident.items);
    resident.meals = resident.inventory.meals;
  }

  private syncHomeInventory(resident: Resident): void {
    resident.homeInventory = SimulationEngine.inventoryFor(resident.homeItems);
  }

  private storeAtHome(resident: Resident): void {
    if (resident.items.length === 0) return;
    resident.homeItems.push(...resident.items);
    resident.items = [];
    this.syncInventory(resident);
    this.syncHomeInventory(resident);
    this.appendLog(resident, "Vorräte zuhause eingelagert.");
  }

  private gatheringMessage(resource: ResourceKind): string {
    if (resource === "fish") return "Fisch gefangen.";
    if (resource === "wood") return "Holz gesammelt.";
    if (resource === "plant") return "Pflanze geerntet.";
    if (resource === "berry") return "Beeren gesammelt.";
    return "Mahlzeit gesammelt.";
  }

  private appendLog(resident: Resident, message: string): void {
    const clock = this.clock();
    resident.log.push({ time: this.time, day: clock.day, hour: clock.hour, minute: clock.minute, message });
  }

  private static inventoryFor(items: StoredResource[]): InventorySnapshot {
    const inventory = SimulationEngine.emptyInventory();
    items.forEach((item) => {
      if (item.kind === "meal") inventory.meals += 1;
      else if (item.kind === "berry") inventory.berries += 1;
      else inventory[item.kind] += 1;
    });
    return inventory;
  }

  private static emptyInventory(): InventorySnapshot {
    return { fish: 0, wood: 0, plant: 0, berries: 0, meals: 0 };
  }

  private static pointKey(point: GridPoint): string {
    return `${point.x}/${point.y}`;
  }

  private static samePoint(left: GridPoint, right: GridPoint): boolean {
    return left.x === right.x && left.y === right.y;
  }

  private findResident(id: string): Resident {
    const resident = this.residents.find((candidate) => candidate.id === id);
    if (resident === undefined) {
      throw new RangeError(`No resident with id ${id}`);
    }
    return resident;
  }
}
