import "./style.css";
import { CameraController, type Point } from "../engine/camera.js";
import type { ResourceKind } from "../engine/resources.js";
import { SimulationEngine, type ResidentSeed, type SimulationSave, type SimulationSnapshot } from "../engine/simulation.js";
import { type Ground, World } from "../engine/world.js";
import { orderResourcePatches, type ResourceRenderPatch } from "./render-order.js";
import { grassTexture, sandTexture, type TextureRect, treeTexture, waterTexture } from "./textures.js";
import { newlyDeadResidents } from "./toasts.js";
import { SimulationRuntime } from "./simulation-runtime.js";

const CELL_SIZE = 64;
const AUTOSAVE_INTERVAL_TICKS = 20;
const requireElement = (selector: string): HTMLElement => {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new TypeError(`Expected an HTML element for ${selector}`);
  }
  return element;
};

const requireCanvas = (selector: string): HTMLCanvasElement => {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLCanvasElement)) {
    throw new TypeError(`Expected a canvas for ${selector}`);
  }
  return element;
};

const requireInput = (selector: string): HTMLInputElement => {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) {
    throw new TypeError(`Expected an input for ${selector}`);
  }
  return element;
};

const residents = (world: World, count = 1, seed = 729): ResidentSeed[] => {
  const names = ["Nia", "Mika", "Lio", "Ava", "Noa", "Eli", "Mara", "Timo"];
  return world.spawnPoints(count, seed).map((position, index) => ({
    id: index === 0 ? "nia" : `resident-${index + 1}`,
    name: names[index] ?? `Bewohner ${index + 1}`,
    position
  }));
};

const createSimulation = (width: number, height: number, seed: number, residentCount = 1): SimulationEngine => {
  const world = World.generate({ width, height, seed });
  return SimulationEngine.start({
    map: world.toAscii(),
    residents: residents(world, residentCount, seed)
  });
};

const initialSimulation = createSimulation(160, 100, 729);
let runtime = new SimulationRuntime(initialSimulation.save(), () => { draw(); }, (message) => {
  workerErrorNotice = message || "Die Simulation wurde neu gestartet.";
  renderWaterDiscoveryToasts();
});
let previousToastSnapshot = runtime.snapshot();

const appElement = requireElement("#app");
appElement.innerHTML = `
  <section class="modal-menu start-menu" id="start-menu" aria-labelledby="start-menu-title"><div class="modal-card"><span class="modal-eyebrow">LIFESIM</span><h1 id="start-menu-title">Eine Welt wartet</h1><p>Starte eine neue Simulation oder setze einen Spielstand fort.</p><div class="modal-actions"><button class="menu-button primary" id="new-simulation">Neue Simulation</button><button class="menu-button" id="continue-simulation">Manuellen Spielstand laden</button><button class="menu-button" id="continue-autosave">Autosave laden</button></div><small class="menu-status" id="start-menu-status" aria-live="polite"></small></div></section>
  <section class="modal-menu world-generator-menu" id="world-generator-menu" hidden aria-labelledby="world-generator-title"><div class="modal-card generator-card"><span class="modal-eyebrow">WELTGENERATOR</span><h1 id="world-generator-title">Neue Welt</h1><p>Erzeuge eine Welt und prüfe ihre Landschaft, bevor die Simulation beginnt.</p><canvas class="world-preview" id="world-preview" width="560" height="320" aria-label="Vorschau der generierten Welt"></canvas><div class="preview-legend"><span><i class="preview-house-marker" aria-hidden="true"></i> Bewohnerhäuser</span></div><label class="generator-setting" for="resident-count">Bewohneranzahl<input id="resident-count" type="number" min="1" max="24" value="1" /></label><input id="world-seed" type="hidden" value="729" /><div class="modal-actions generator-actions"><button class="menu-button" id="random-world">↻ Zufällige Welt</button><button class="menu-button primary" id="start-generated-simulation">Simulation starten</button><button class="menu-button subtle" id="generator-back">Zurück</button></div></div></section>
  <section class="modal-menu pause-menu" id="pause-menu" hidden aria-labelledby="pause-menu-title"><div class="modal-card"><span class="modal-eyebrow">PAUSE</span><h1 id="pause-menu-title">Simulation pausiert</h1><p>Dein Spielstand kann jederzeit gespeichert werden.</p><div class="modal-actions"><button class="menu-button primary" id="resume-simulation">Fortsetzen</button><button class="menu-button" id="save-simulation">Simulation speichern</button><button class="menu-button subtle" id="main-menu">Zum Startmenü</button></div><small class="menu-status" id="pause-menu-status" aria-live="polite"></small></div></section>
  <section class="workspace">
    <div class="map-area"><canvas id="world"></canvas><div class="map-controls"><div class="map-control-row"><button class="icon-control pause-control" id="play" aria-label="Simulation pausieren">Ⅱ</button><button class="icon-control speed-control selected" id="speed-normal" aria-label="Normales Tempo" aria-pressed="true"><span aria-hidden="true">▶</span><small>1</small></button><button class="icon-control speed-control" id="speed-fast" aria-label="Schnelles Tempo" aria-pressed="false"><span aria-hidden="true">▶</span><small>2</small></button><button class="icon-control speed-control" id="speed-very-fast" aria-label="Sehr schnelles Tempo" aria-pressed="false"><span aria-hidden="true">▶</span><small>3</small></button></div><span class="clock" id="clock">Tag 1 · 06:00</span></div><div class="patch-tooltip" id="patch" hidden></div><div class="map-hint">Ziehen: Karte bewegen · Mausrad: Zoom · Klick: Patch inspizieren</div></div>
  </section>
  <aside class="sidebar" aria-label="Bewohner">
    <section class="resident-section"><div class="resident-sidebar-header"><div class="panel-heading"><span class="panel-icon" aria-hidden="true">♟</span><div><span class="panel-kicker">SIEDLUNG</span><h2>Bewohner</h2></div></div><span class="resident-count"><b id="population">0</b><small> aktiv</small></span></div><div id="residents"></div></section>
  </aside>
  <div class="toast-container" id="toast-container" aria-live="polite" aria-atomic="false"></div>
  <aside class="log-sidebar" id="resident-log-panel" hidden><div class="log-header"><div class="panel-heading"><span class="panel-icon" aria-hidden="true">▤</span><div><span class="panel-kicker">CHRONIK</span><h2 id="resident-log-title">History</h2></div></div><button class="log-close" id="close-resident-log" aria-label="History schließen">×</button></div><input class="log-search" id="resident-log-search" type="search" placeholder="History durchsuchen" aria-label="History durchsuchen" /><label class="history-filter"><input id="show-movement-logs" type="checkbox" /> Bewegungslogs anzeigen</label><div class="resident-history-summary" id="resident-history-summary"></div><ol class="resident-history" id="resident-log"></ol></aside>`;

const canvas = requireCanvas("#world");
const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("Could not create a 2D canvas context");
}
const worldPreviewCanvas = requireCanvas("#world-preview");
const worldPreviewContext = worldPreviewCanvas.getContext("2d");
if (worldPreviewContext === null) {
  throw new Error("Could not create a world preview context");
}
const clockElement = requireElement("#clock");
const startMenuElement = requireElement("#start-menu");
const startMenuStatusElement = requireElement("#start-menu-status");
const newSimulationButton = requireElement("#new-simulation");
const continueSimulationButton = requireElement("#continue-simulation");
const continueAutosaveButton = requireElement("#continue-autosave");
const pauseMenuElement = requireElement("#pause-menu");
const pauseMenuStatusElement = requireElement("#pause-menu-status");
const resumeSimulationButton = requireElement("#resume-simulation");
const saveSimulationButton = requireElement("#save-simulation");
const mainMenuButton = requireElement("#main-menu");
const worldGeneratorMenuElement = requireElement("#world-generator-menu");
const residentCountInput = requireInput("#resident-count");
const worldSeedInput = requireInput("#world-seed");
const randomWorldButton = requireElement("#random-world");
const startGeneratedSimulationButton = requireElement("#start-generated-simulation");
const generatorBackButton = requireElement("#generator-back");
const populationElement = requireElement("#population");
const residentListElement = requireElement("#residents");
const residentLogPanelElement = requireElement("#resident-log-panel");
const residentLogTitleElement = requireElement("#resident-log-title");
const residentHistorySummaryElement = requireElement("#resident-history-summary");
const residentLogElement = requireElement("#resident-log");
const residentLogSearchInput = requireInput("#resident-log-search");
const showMovementLogsInput = requireInput("#show-movement-logs");
const toastContainerElement = requireElement("#toast-container");
const closeResidentLogButton = requireElement("#close-resident-log");
const patchElement = requireElement("#patch");
const playButton = requireElement("#play");
const normalSpeedButton = requireElement("#speed-normal");
const fastSpeedButton = requireElement("#speed-fast");
const veryFastSpeedButton = requireElement("#speed-very-fast");
let camera = new CameraController({ x: 160, y: 120, zoom: 0.28 });
let running = false;
let savedSimulation: SimulationSave | undefined;
let savedAutosave: SimulationSave | undefined;
let tickDelay = 1000;
let selected: { x: number; y: number } | undefined;
let loggedResidentId = "nia";
let residentLogSearch = "";
const expandedResidents = new Set<string>();
let showMovementLogs = false;
const knownWaterCounts = new Map<string, number>();
const waterDiscoveryNotices = new Map<string, string>();
const waterDiscoveryNotified = new Set<string>();
const deathNotices = new Map<string, string>();
let workerErrorNotice = "";
let pointerStart: Point | undefined;
let lastPointer: Point | undefined;
let dragged = false;
let interval: ReturnType<typeof globalThis.setInterval> | undefined;

residentLogPanelElement.hidden = true;
patchElement.hidden = true;
startMenuElement.hidden = false;
pauseMenuElement.hidden = true;
worldGeneratorMenuElement.hidden = true;

const RESIDENT_COLOR = "#e3b35a";
const resourcePresentation: Record<ResourceKind, { icon: string; label: string }> = {
  fish: { icon: "🐟", label: "Fisch" },
  wood: { icon: "🪵", label: "Holz" },
  plant: { icon: "🌿", label: "Pflanzen" },
  berry: { icon: "🫐", label: "Beeren" },
  meal: { icon: "🍲", label: "Mahlzeiten" }
};
const patchPresentation: Record<Ground, { icon: string; label: string }> = {
  grass: { icon: "🌱", label: "Wiese" },
  sand: { icon: "◌", label: "Sand" },
  water: { icon: "💧", label: "Gewässer" },
  forest: { icon: "🌳", label: "Baum" },
  berryBush: { icon: "🫐", label: "Beerenstrauch" }
};
const timeOfDayIcons: Record<SimulationSnapshot["clock"]["phase"], { icon: string; label: string }> = {
  dawn: { icon: "☼", label: "Morgengrauen" },
  day: { icon: "☀", label: "Tag" },
  dusk: { icon: "◒", label: "Abenddämmerung" },
  night: { icon: "☾", label: "Nacht" }
};
const previewColors: Record<Ground, string> = {
  grass: "#719d67",
  sand: "#c5a56e",
  water: "#3e91ad",
  forest: "#365f40",
  berryBush: "#4d6b43"
};
const requestedResidentCount = (): number => {
  const parsed = Number.parseInt(residentCountInput.value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(24, parsed)) : 1;
};
const renderWorldPreview = (world: World): void => {
  const patches = world.snapshot();
  const width = world.dimensions().width;
  const height = world.dimensions().height;
  const scale = Math.min(worldPreviewCanvas.width / width, worldPreviewCanvas.height / height);
  const offsetX = (worldPreviewCanvas.width - width * scale) / 2;
  const offsetY = (worldPreviewCanvas.height - height * scale) / 2;
  worldPreviewContext.clearRect(0, 0, worldPreviewCanvas.width, worldPreviewCanvas.height);
  patches.forEach((row, y) => row.forEach((patch, x) => {
    worldPreviewContext.fillStyle = previewColors[patch.ground];
    worldPreviewContext.fillRect(offsetX + x * scale, offsetY + y * scale, Math.ceil(scale), Math.ceil(scale));
    if (patch.ground === "forest") {
      worldPreviewContext.fillStyle = "#24452f";
      worldPreviewContext.fillRect(offsetX + x * scale + scale * 0.25, offsetY + y * scale + scale * 0.25, scale * 0.5, scale * 0.5);
    }
    if (patch.ground === "berryBush") {
      worldPreviewContext.fillStyle = "#a64d74";
      worldPreviewContext.fillRect(offsetX + x * scale + scale * 0.35, offsetY + y * scale + scale * 0.35, Math.max(1, scale * 0.3), Math.max(1, scale * 0.3));
    }
  }));
  residents(world, requestedResidentCount(), Number(worldSeedInput.value) || 729).forEach((resident) => {
    // The preview is considerably smaller than the simulation map. Draw the
    // home as a deliberately oversized pixel marker so its start position is
    // obvious even when a single map cell is only a few screen pixels wide.
    const centerX = Math.round(offsetX + (resident.position.x + 0.5) * scale);
    const centerY = Math.round(offsetY + (resident.position.y + 0.5) * scale);
    const markerSize = Math.max(12, Math.round(scale * 3));
    const left = centerX - Math.floor(markerSize / 2);
    const top = centerY - Math.floor(markerSize / 2);
    const roofHeight = Math.max(4, Math.round(markerSize * 0.34));

    // Light halo separates the marker from grass, sand and water.
    worldPreviewContext.fillStyle = "rgba(255, 241, 166, .78)";
    worldPreviewContext.fillRect(left - 3, top - 3, markerSize + 6, markerSize + 6);
    // Shadow, roof, walls and a bright door form a tiny readable house icon.
    worldPreviewContext.fillStyle = "rgba(18, 29, 35, .72)";
    worldPreviewContext.fillRect(left + 1, top + markerSize - 2, markerSize, 3);
    worldPreviewContext.fillStyle = "#5b342d";
    worldPreviewContext.fillRect(left, top, markerSize, roofHeight);
    worldPreviewContext.fillStyle = "#d9c5a1";
    worldPreviewContext.fillRect(left + 2, top + roofHeight, markerSize - 4, markerSize - roofHeight - 1);
    worldPreviewContext.fillStyle = "#f4dc88";
    worldPreviewContext.fillRect(centerX - 1, top + roofHeight + 2, 3, Math.max(3, markerSize - roofHeight - 4));
  });
};
const speedControls = [
  { button: normalSpeedButton, delay: 1000 },
  { button: fastSpeedButton, delay: 450 },
  { button: veryFastSpeedButton, delay: 150 }
];
const renderPlayButton = (): void => {
  playButton.textContent = running ? "Ⅱ" : "▶";
  playButton.ariaLabel = running ? "Simulation pausieren" : "Simulation fortsetzen";
};

renderPlayButton();

const drawTexture = (texture: TextureRect[], left: number, top: number): void => {
  texture.forEach((rectangle) => {
    context.fillStyle = rectangle.color;
    context.fillRect(left + rectangle.x, top + rectangle.y, rectangle.width, rectangle.height);
  });
};

const drawWaterPatch = (left: number, top: number, x: number, y: number): void => {
  drawTexture(waterTexture(x, y), left, top);
};

const drawSandPatch = (left: number, top: number, x: number, y: number): void => {
  drawTexture(sandTexture(x, y), left, top);
};

const drawLandPatch = (left: number, top: number, x: number, y: number): void => {
  drawTexture(grassTexture(x, y), left, top);
};

const drawPatchArt = (ground: Ground, stock: number, left: number, top: number, x: number, y: number): void => {
  if (ground === "water") {
    drawWaterPatch(left, top, x, y);
  } else if (ground === "sand") {
    drawSandPatch(left, top, x, y);
  } else {
    drawLandPatch(left, top, x, y);
  }
  if (ground !== "sand" && ground !== "forest" && ground !== "berryBush" && stock < 100) {
    context.fillStyle = "rgba(22, 35, 42, 0.38)";
    context.fillRect(left, top, CELL_SIZE - 1, CELL_SIZE - 1);
  }
};

const drawTreeArt = (stock: number, left: number, top: number, x: number, y: number): void => {
  drawTexture(treeTexture(x, y, stock), left, top);
};

const drawBerryBushArt = (stock: number, left: number, top: number): void => {
  context.fillStyle = "#245137";
  context.fillRect(left + 8, top + 24, 48, 28);
  context.fillStyle = "#397343";
  context.fillRect(left + 16, top + 16, 32, 40);
  context.fillStyle = "#55934a";
  context.fillRect(left + 24, top + 10, 16, 40);
  context.fillStyle = "#7bb458";
  context.fillRect(left + 20, top + 22, 8, 8);
  context.fillRect(left + 40, top + 30, 8, 8);
  context.fillStyle = "#a64d74";
  context.fillRect(left + 16, top + 36, 8, 8);
  context.fillRect(left + 32, top + 26, 8, 8);
  context.fillRect(left + 40, top + 44, 8, 8);
  if (stock < 50) {
    context.fillStyle = "rgba(52, 30, 20, 0.42)";
    context.fillRect(left + 8, top + 36, 48, 16);
  }
};

const drawHomeArt = (left: number, top: number): void => {
  context.fillStyle = "#d9c5a1";
  context.fillRect(left + 16, top + 31, 32, 22);
  context.fillStyle = "#6a4135";
  context.fillRect(left + 12, top + 27, 40, 5);
  context.fillRect(left + 20, top + 22, 24, 5);
  context.fillRect(left + 28, top + 17, 8, 5);
  context.fillStyle = "#26303a";
  context.fillRect(left + 28, top + 40, 8, 13);
  context.fillStyle = "#f4dc88";
  context.fillRect(left + 19, top + 37, 6, 6);
};

const drawFishingRod = (centerX: number, centerY: number, facing: SimulationSnapshot["residents"][number]["facing"]): void => {
  const rod = {
    north: { shaft: { x: -2, y: -34, width: 4, height: 24 }, line: { x: 2, y: -43, width: 1, height: 9 }, bobber: { x: 1, y: -43 } },
    east: { shaft: { x: 8, y: -2, width: 24, height: 4 }, line: { x: 32, y: 2, width: 9, height: 1 }, bobber: { x: 41, y: 1 } },
    south: { shaft: { x: -2, y: 8, width: 4, height: 24 }, line: { x: 2, y: 32, width: 1, height: 9 }, bobber: { x: 1, y: 41 } },
    west: { shaft: { x: -34, y: -2, width: 24, height: 4 }, line: { x: -41, y: 2, width: 9, height: 1 }, bobber: { x: -43, y: 1 } }
  }[facing];
  context.fillStyle = "#593a29";
  context.fillRect(centerX + rod.shaft.x, centerY + rod.shaft.y, rod.shaft.width, rod.shaft.height);
  context.fillStyle = "#c99854";
  context.fillRect(centerX + rod.shaft.x, centerY + rod.shaft.y, rod.shaft.width === 4 ? 1 : rod.shaft.width, rod.shaft.height === 4 ? 1 : rod.shaft.height);
  context.fillStyle = "#c6e5e8";
  context.fillRect(centerX + rod.line.x, centerY + rod.line.y, rod.line.width, rod.line.height);
  context.fillStyle = "#de5c50";
  context.fillRect(centerX + rod.bobber.x, centerY + rod.bobber.y, 4, 4);
};

const drawResidentArt = (resident: SimulationSnapshot["residents"][number], displayPosition = resident.position): void => {
  const centerX = displayPosition.x * CELL_SIZE + CELL_SIZE / 2;
  const centerY = displayPosition.y * CELL_SIZE + CELL_SIZE / 2;
  const facingOffset = { north: { x: 0, y: -8 }, east: { x: 8, y: 0 }, south: { x: 0, y: 8 }, west: { x: -8, y: 0 } }[resident.facing];
  context.fillStyle = "rgba(18, 29, 35, 0.34)";
  context.fillRect(centerX - 10, centerY + 14, 20, 4);
  context.fillStyle = RESIDENT_COLOR;
  context.fillRect(centerX - 9, centerY - 4, 18, 18);
  context.fillRect(centerX - 7, centerY - 14, 14, 11);
  context.fillStyle = "#23333b";
  context.fillRect(centerX - 7 + facingOffset.x, centerY - 10 + facingOffset.y, 5, 5);
  if (resident.activity === "fishing") drawFishingRod(centerX, centerY, resident.facing);
  context.fillStyle = "#101923";
  context.fillRect(centerX - 7, centerY + 14, 5, 5);
  context.fillRect(centerX + 2, centerY + 14, 5, 5);
};

const viewportPoint = (event: MouseEvent | WheelEvent): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

const resize = (): void => {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  context.imageSmoothingEnabled = false;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
};

const draw = (): void => {
  const snapshot = runtime.snapshot();
  const { x, y, zoom } = camera.snapshot();
  const { width, height } = canvas.getBoundingClientRect();
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(-x * zoom, -y * zoom);
  context.scale(zoom, zoom);
  const firstColumn = Math.max(0, Math.floor(x / CELL_SIZE) - 1);
  const lastColumn = Math.min(snapshot.world[0].length - 1, Math.ceil((x + width / zoom) / CELL_SIZE) + 1);
  const firstRow = Math.max(0, Math.floor(y / CELL_SIZE) - 1);
  const lastRow = Math.min(snapshot.world.length - 1, Math.ceil((y + height / zoom) / CELL_SIZE) + 1);
  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
    for (let columnIndex = firstColumn; columnIndex <= lastColumn; columnIndex += 1) {
      const patch = snapshot.world[rowIndex][columnIndex];
      const left = columnIndex * CELL_SIZE;
      const top = rowIndex * CELL_SIZE;
      drawPatchArt(patch.ground, patch.stock, left, top, columnIndex, rowIndex);
      if (selected?.x === columnIndex && selected.y === rowIndex) {
        context.strokeStyle = "#ffffff";
        context.lineWidth = 3 / zoom;
        context.strokeRect(left + 2 / zoom, top + 2 / zoom, CELL_SIZE - 4 / zoom, CELL_SIZE - 4 / zoom);
      }
    }
  }
  snapshot.residents.forEach((resident) => {
    const left = resident.home.x * CELL_SIZE;
    const top = resident.home.y * CELL_SIZE;
    drawHomeArt(left, top);
  });
  snapshot.residents.forEach((resident) => {
    const target = resident.activityTarget;
    const treeTarget = target !== undefined
      && resident.activity === "harvesting"
      && snapshot.world[target.y]?.[target.x]?.ground === "forest";
    drawResidentArt(resident, treeTarget ? target : resident.position);
  });
  const resourcePatches: ResourceRenderPatch[] = [];
  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
    for (let columnIndex = firstColumn; columnIndex <= lastColumn; columnIndex += 1) {
      const patch = snapshot.world[rowIndex][columnIndex];
      if (patch.ground === "forest" || patch.ground === "berryBush") {
        resourcePatches.push({ ground: patch.ground, x: columnIndex, y: rowIndex });
      }
    }
  }
  orderResourcePatches(resourcePatches).forEach(({ ground, x: patchX, y: patchY }) => {
    const stock = snapshot.world[patchY][patchX].stock;
    if (ground === "forest") drawTreeArt(stock, patchX * CELL_SIZE, patchY * CELL_SIZE, patchX, patchY);
    if (ground === "berryBush") drawBerryBushArt(stock, patchX * CELL_SIZE, patchY * CELL_SIZE);
  });
  context.restore();
  const lightOverlay = {
    dawn: "rgba(243, 177, 101, 0.12)",
    day: "rgba(255, 255, 255, 0)",
    dusk: "rgba(139, 73, 133, 0.22)",
    night: "rgba(8, 20, 57, 0.48)"
  };
  context.fillStyle = lightOverlay[snapshot.clock.phase];
  context.fillRect(0, 0, width, height);
  renderSidebar(snapshot);
  renderPatchTooltip(snapshot, { width, height });
};

const statusMeterMarkup = (kind: string, icon: string, label: string, value: number): string => {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  let severity = "";
  if (percent <= 20) severity = " critical";
  else if (percent <= 40) severity = " warning";
  return `<div class="status-meter ${kind}${severity}"><span class="status-icon" aria-hidden="true">${icon}</span><span class="status-label">${label}</span><progress max="100" value="${percent}" aria-label="${label}: ${percent} %"></progress><output>${percent}%</output></div>`;
};

const residentActivityMarkup = (resident: SimulationSnapshot["residents"][number], world: SimulationSnapshot["world"]): string => {
  const states = {
    sleeping: ["☾", "Schläft"],
    eating: ["🍲", "Frühstück / Vorräte"],
    returning: ["⌂", "Geht nach Hause"],
    dead: ["†", "Verstorben"],
    working: ["➜", "Unterwegs"]
  };
  let [icon, label] = states[resident.state];
  if (resident.state === "working" && resident.activity !== "idle") {
    const target = resident.activityTarget;
    const ground = target === undefined ? undefined : world[target.y]?.[target.x]?.ground;
    if (resident.activity === "fishing") [icon, label] = ["🎣", "Angelt"];
    else if (ground === "forest") [icon, label] = ["🪓", "Hackt Holz"];
    else if (ground === "berryBush") [icon, label] = ["🫐", "Erntet Beeren"];
    else [icon, label] = ["🌿", "Sammelt Pflanzen"];
  }
  return `<span class="resident-activity"><span aria-hidden="true">${icon}</span>${label}</span>`;
};

const residentCardMarkup = (resident: SimulationSnapshot["residents"][number], world: SimulationSnapshot["world"]): string => {
  const facing = ({ north: "↑", east: "→", south: "↓", west: "←" })[resident.facing];
  const expanded = expandedResidents.has(resident.id);
  return `
    <article class="resident-card">
      <button class="resident-summary" data-resident-toggle-id="${resident.id}" aria-expanded="${expanded}" aria-controls="resident-details-${resident.id}" aria-label="Details von ${resident.name} ${expanded ? "einklappen" : "aufklappen"}">
        <span class="resident-avatar" aria-hidden="true">${resident.name[0]}</span>
        <span class="resident-identity"><strong>${resident.name}</strong>${residentActivityMarkup(resident, world)}</span>
        <span class="resident-facing" aria-hidden="true"><span class="resident-chevron"></span></span>
      </button>
      <div id="resident-details-${resident.id}"${expanded ? "" : " hidden"}>
      <div class="resident-meters">
        ${statusMeterMarkup("fitness", "⚡", "Fitness", resident.fitness)}
        ${statusMeterMarkup("satiety", "🍲", "Sättigung", 100 - resident.hunger)}
        ${statusMeterMarkup("hydration", "💧", "Wasser", resident.hydration)}
        ${statusMeterMarkup("health", "♥", "Gesundheit", resident.health)}
      </div>
      <div class="resident-data">
        <div class="resident-data-row"><span class="resident-data-title">Wissen</span><div class="resident-chips"><span class="resident-chip" aria-label="Bekannte Gewässer: ${resident.knownWaters.length} von 2">💧 ${resident.knownWaters.length}/2</span><span class="resident-chip" aria-label="Bekannte Bäume: ${resident.knownTrees.length} von 3">🌳 ${resident.knownTrees.length}/3</span><span class="resident-chip" aria-label="Bekannte Büsche: ${resident.knownBerryBushes.length} von 3">🫐 ${resident.knownBerryBushes.length}/3</span></div></div>
        <div class="resident-data-row"><span class="resident-data-title">Inventar</span><div class="resident-chips"><span class="resident-chip" title="Fisch">🐟 ${resident.inventory.fish}</span><span class="resident-chip" title="Holz">🪵 ${resident.inventory.wood}</span><span class="resident-chip" title="Pflanze">🌿 ${resident.inventory.plant}</span><span class="resident-chip" title="Beeren">🫐 ${resident.inventory.berries}</span><span class="resident-chip" title="Mahlzeit">🍲 ${resident.inventory.meals}</span></div></div>
      </div>
      <button class="resident-log-button" data-resident-log-id="${resident.id}" aria-label="History von ${resident.name} öffnen"><span aria-hidden="true">☷</span> History öffnen</button>
      <button class="resident-locate-button" data-resident-id="${resident.id}" aria-label="${resident.name} auf der Karte anzeigen">${facing} Auf Karte anzeigen</button>
      </div>
    </article>`;
};

const historySummaryMarkup = (entries: SimulationSnapshot["residents"][number]["log"]): string => {
  const totals: Record<"collected" | "consumed", Record<ResourceKind, number>> = {
    collected: { fish: 0, wood: 0, plant: 0, berry: 0, meal: 0 },
    consumed: { fish: 0, wood: 0, plant: 0, berry: 0, meal: 0 }
  };
  entries.forEach((entry) => {
    if (entry.resourceChange !== undefined) {
      totals[entry.resourceChange.action][entry.resourceChange.kind] += entry.resourceChange.amount;
    }
  });
  const chips = (action: "collected" | "consumed", kinds: ResourceKind[]): string => kinds.map((kind) => {
    const resource = resourcePresentation[kind];
    return `<span class="history-resource-chip" title="${resource.label}">${resource.icon} ${totals[action][kind]}</span>`;
  }).join("");
  return `<div class="history-total-group"><span>Gesammelt</span><div>${chips("collected", ["fish", "wood", "plant", "berry"])}</div></div><div class="history-total-group"><span>Konsumiert</span><div>${chips("consumed", ["meal", "berry"])}</div></div>`;
};

const historyEntryMarkup = (entry: SimulationSnapshot["residents"][number]["log"][number]): string => {
  const change = entry.resourceChange;
  const changeMarkup = change === undefined ? "" : (() => {
    const resource = resourcePresentation[change.kind];
    const sign = change.action === "collected" ? "+" : "−";
    return `<span class="history-change ${change.action}">${sign}${change.amount} ${resource.icon} ${resource.label}</span>`;
  })();
  return `<li><time>Tag ${entry.day} · ${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}</time><span>${entry.message}</span>${changeMarkup}</li>`;
};

const renderWaterDiscoveryToasts = (): void => {
  const waterToasts = [...waterDiscoveryNotices.entries()].map(([residentId, message]) =>
    `<div class="discovery-toast" role="status"><span class="discovery-toast-icon" aria-hidden="true">💧</span><span>${message}</span><button class="toast-close" data-water-toast-close="${residentId}" aria-label="Meldung schließen">×</button></div>`
  );
  const deathToasts = [...deathNotices.entries()].map(([residentId, message]) =>
    `<div class="discovery-toast death-toast" role="status"><span class="discovery-toast-icon" aria-hidden="true">†</span><span>${message}</span><button class="toast-close" data-death-toast-close="${residentId}" aria-label="Meldung schließen">×</button></div>`
  );
  const workerToast = workerErrorNotice === "" ? [] : [`<div class="discovery-toast worker-error-toast" role="alert"><span class="discovery-toast-icon" aria-hidden="true">!</span><span>${workerErrorNotice}</span><button class="toast-close" data-worker-toast-close="true" aria-label="Fehlermeldung schließen">×</button></div>`];
  toastContainerElement.innerHTML = [...waterToasts, ...deathToasts, ...workerToast].join("");
};

const updateWaterDiscoveryToasts = (snapshot: SimulationSnapshot): void => {
  newlyDeadResidents(previousToastSnapshot.residents, snapshot.residents).forEach(({ id, name }) => {
    deathNotices.set(id, `${name} ist verstorben.`);
  });
  previousToastSnapshot = snapshot;
  snapshot.residents.forEach((resident) => {
    const currentCount = resident.knownWaters.length;
    const previousCount = knownWaterCounts.get(resident.id);
    if (previousCount === undefined) {
      knownWaterCounts.set(resident.id, currentCount);
      return;
    }
    if (previousCount === 0 && currentCount > 0 && !waterDiscoveryNotified.has(resident.id)) {
      waterDiscoveryNotified.add(resident.id);
      waterDiscoveryNotices.set(resident.id, `${resident.name} hat sein erstes Gewässer entdeckt.`);
    }
    knownWaterCounts.set(resident.id, currentCount);
  });
  renderWaterDiscoveryToasts();
};

const renderSidebar = (snapshot: SimulationSnapshot): void => {
  updateWaterDiscoveryToasts(snapshot);
  populationElement.textContent = String(snapshot.residents.length);
  const timeOfDay = timeOfDayIcons[snapshot.clock.phase];
  clockElement.innerHTML = `<span class="time-of-day-icon" role="img" aria-label="${timeOfDay.label}">${timeOfDay.icon}</span><span>Tag ${snapshot.clock.day} · ${String(snapshot.clock.hour).padStart(2, "0")}:${String(snapshot.clock.minute).padStart(2, "0")}</span>`;
  const tickTooltip = `${snapshot.time} ${snapshot.time === 1 ? "Tick" : "Ticks"} vergangen.`;
  clockElement.title = tickTooltip;
  clockElement.dataset.tooltip = tickTooltip;
  residentListElement.innerHTML = snapshot.residents.map((resident) => residentCardMarkup(resident, snapshot.world)).join("");
  const loggedResident = snapshot.residents.find((resident) => resident.id === loggedResidentId) ?? snapshot.residents[0];
  if (loggedResident === undefined) {
    residentLogTitleElement.textContent = "History";
    residentHistorySummaryElement.innerHTML = historySummaryMarkup([]);
    residentLogElement.innerHTML = "<li>Noch keine Bewohner.</li>";
  } else {
    residentLogTitleElement.textContent = `History · ${loggedResident.name}`;
    residentHistorySummaryElement.innerHTML = historySummaryMarkup(loggedResident.log);
    const matchingEntries = loggedResident.log.filter((entry) => {
      if (!showMovementLogs && /^Geht nach \d+\/\d+\.$/.test(entry.message)) return false;
      const searchableEntry = `${entry.day} ${entry.hour} ${entry.minute} ${entry.message}`.toLocaleLowerCase("de-DE");
      return searchableEntry.includes(residentLogSearch);
    });
    if (loggedResident.log.length === 0) residentLogElement.innerHTML = "<li>Noch keine Aktionen.</li>";
    else if (matchingEntries.length === 0) residentLogElement.innerHTML = "<li>Keine passenden Einträge.</li>";
    else residentLogElement.innerHTML = [...matchingEntries].reverse().map(historyEntryMarkup).join("");
  }
};

const patchInspectorMarkup = (snapshot: SimulationSnapshot, point: Point): string => {
  const patch = snapshot.world[point.y]?.[point.x];
  if (patch === undefined) return "Außerhalb der Karte";

  const homeowner = snapshot.residents.find((resident) => resident.home.x === point.x && resident.home.y === point.y);
  const closeButton = `<button class="patch-close" data-close-patch="true" aria-label="Patch-Informationen schließen">×</button>`;
  if (homeowner !== undefined) {
    const inventory = homeowner.homeInventory;
    return `<div class="patch-tooltip-header"><span class="patch-kind-icon" aria-hidden="true">⌂</span><span><strong>Hütte von ${homeowner.name}</strong><small>Patch ${point.x} / ${point.y}</small></span>${closeButton}</div><div class="patch-tooltip-body"><span class="patch-section-label">Hausinventar</span><div class="patch-inventory-group"><span class="patch-section-label">Nahrung</span><div class="patch-inventory"><span title="Fisch">🐟 <b>${inventory.fish}</b></span><span title="Beeren">🫐 <b>${inventory.berries}</b></span><span title="Mahlzeiten">🍲 <b>${inventory.meals}</b></span></div></div><div class="patch-inventory-group"><span class="patch-section-label">Materialien</span><div class="patch-inventory"><span title="Holz">🪵 <b>${inventory.wood}</b></span><span title="Pflanzen">🌿 <b>${inventory.plant}</b></span></div></div></div>`;
  }
  const presentation = patchPresentation[patch.ground];
  return `<div class="patch-tooltip-header"><span class="patch-kind-icon" aria-hidden="true">${presentation.icon}</span><span><strong>${presentation.label}</strong><small>Patch ${point.x} / ${point.y}</small></span>${closeButton}</div><div class="patch-tooltip-body"><div class="patch-stat"><span>Bestand</span><strong>${patch.stock}</strong></div></div>`;
};

const renderPatchTooltip = (snapshot: SimulationSnapshot, viewport: { height: number; width: number }): void => {
  if (selected === undefined || snapshot.world[selected.y]?.[selected.x] === undefined) {
    patchElement.hidden = true;
    return;
  }
  const { x, y, zoom } = camera.snapshot();
  const patchLeft = (selected.x * CELL_SIZE - x) * zoom;
  const patchTop = (selected.y * CELL_SIZE - y) * zoom;
  const patchSize = CELL_SIZE * zoom;
  if (patchLeft + patchSize < 0 || patchTop + patchSize < 0 || patchLeft > viewport.width || patchTop > viewport.height) {
    patchElement.hidden = true;
    return;
  }
  patchElement.innerHTML = patchInspectorMarkup(snapshot, selected);
  patchElement.style.left = `${Math.max(8, Math.min(viewport.width - 258, patchLeft + patchSize + 8))}px`;
  patchElement.style.top = `${Math.max(8, Math.min(viewport.height - 180, patchTop + 8))}px`;
  patchElement.hidden = false;
};

const persistResidentLog = (): void => {
  const snapshot = runtime.snapshot();
  desktop.writeResidentLog({
    time: snapshot.time,
    clock: snapshot.clock,
    residents: snapshot.residents.map((resident) => ({ id: resident.id, name: resident.name, log: resident.log }))
  }).catch(() => undefined);
};
const persistAutosave = (): void => {
  runtime.save().then((save) => { savedSimulation = save; return desktop.saveSimulation(save, "autosave"); }).catch(() => {
    // Autosave is best-effort; the simulation itself continues running.
  });
};

const step = (): void => {
  runtime.advance();
  persistResidentLog();
  if (runtime.snapshot().time % AUTOSAVE_INTERVAL_TICKS === 0) persistAutosave();
  draw();
};
const restartInterval = (): void => {
  if (interval !== undefined) globalThis.clearInterval(interval);
  interval = globalThis.setInterval(() => { if (running) step(); }, tickDelay);
};

const selectTickSpeed = (delay: number): void => {
  tickDelay = delay;
  speedControls.forEach((control) => {
    control.button.classList.remove("selected");
    if (control.delay === delay) control.button.classList.add("selected");
  });
  restartInterval();
};

const hideMenus = (): void => {
  startMenuElement.hidden = true;
  pauseMenuElement.hidden = true;
  worldGeneratorMenuElement.hidden = true;
};

const startSimulation = (nextSimulation: SimulationEngine): void => {
  runtime.start(nextSimulation.save());
  knownWaterCounts.clear();
  waterDiscoveryNotices.clear();
  waterDiscoveryNotified.clear();
  deathNotices.clear();
  workerErrorNotice = "";
  previousToastSnapshot = nextSimulation.snapshot();
  renderWaterDiscoveryToasts();
  running = true;
  selected = undefined;
  hideMenus();
  renderPlayButton();
  persistResidentLog();
  draw();
  restartInterval();
};

const openWorldGenerator = (): void => {
  startMenuElement.hidden = true;
  pauseMenuElement.hidden = true;
  worldGeneratorMenuElement.hidden = false;
  renderWorldPreview(World.generate({ width: 160, height: 100, seed: Number(worldSeedInput.value) || 729 }));
};

const startGeneratedSimulation = (): void => {
  camera = new CameraController({ x: 160, y: 120, zoom: 0.28 });
  const seed = Number.parseInt(worldSeedInput.value, 10);
  startSimulation(createSimulation(160, 100, Number.isFinite(seed) && seed >= 0 ? seed : 729, requestedResidentCount()));
};

const saveCurrentSimulation = async (): Promise<void> => {
  savedSimulation = await runtime.save();
  await desktop.saveSimulation(savedSimulation, "manual");
  pauseMenuStatusElement.textContent = "Spielstand gespeichert.";
};

const loadSavedSimulation = async (): Promise<void> => {
  try {
    [savedSimulation, savedAutosave] = await Promise.all([
      desktop.loadSimulation("manual") as Promise<SimulationSave | undefined>,
      desktop.loadSimulation("autosave") as Promise<SimulationSave | undefined>
    ]);
    continueSimulationButton.setAttribute("aria-disabled", savedSimulation === undefined ? "true" : "false");
    continueAutosaveButton.setAttribute("aria-disabled", savedAutosave === undefined ? "true" : "false");
    startMenuStatusElement.textContent = savedSimulation === undefined && savedAutosave === undefined ? "Noch kein Spielstand vorhanden." : "Spielstände bereit zum Fortsetzen.";
  } catch {
    startMenuStatusElement.textContent = "Spielstand konnte nicht geladen werden.";
  }
};

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const current = camera.snapshot().zoom;
  const next = Math.max(0.12, Math.min(3.5, current * Math.exp(-event.deltaY * 0.001)));
  camera.zoomAt(viewportPoint(event), next);
  draw();
}, { passive: false });
canvas.addEventListener("pointerdown", (event) => { pointerStart = viewportPoint(event); lastPointer = pointerStart; dragged = false; canvas.setPointerCapture(event.pointerId); canvas.classList.add("dragging"); });
canvas.addEventListener("pointermove", (event) => {
  if (lastPointer === undefined || pointerStart === undefined) return;
  const point = viewportPoint(event);
  const delta = { x: point.x - lastPointer.x, y: point.y - lastPointer.y };
  if (Math.abs(point.x - pointerStart.x) + Math.abs(point.y - pointerStart.y) > 4) dragged = true;
  camera.panBy(delta); lastPointer = point; draw();
});
canvas.addEventListener("pointerup", (event) => {
  canvas.classList.remove("dragging");
  if (!dragged) {
    const point = viewportPoint(event); const view = camera.snapshot();
    selected = { x: Math.floor((view.x + point.x / view.zoom) / CELL_SIZE), y: Math.floor((view.y + point.y / view.zoom) / CELL_SIZE) };
    draw();
  }
  pointerStart = undefined; lastPointer = undefined;
});
playButton.addEventListener("click", () => {
  running = !running;
  renderPlayButton();
});
normalSpeedButton.addEventListener("click", () => { selectTickSpeed(1000); });
fastSpeedButton.addEventListener("click", () => { selectTickSpeed(450); });
veryFastSpeedButton.addEventListener("click", () => { selectTickSpeed(150); });
newSimulationButton.addEventListener("click", openWorldGenerator);
residentCountInput.addEventListener("input", () => {
  renderWorldPreview(World.generate({ width: 160, height: 100, seed: Number(worldSeedInput.value) || 729 }));
});
randomWorldButton.addEventListener("click", () => {
  const seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 729;
  worldSeedInput.value = String(seed);
  renderWorldPreview(World.generate({ width: 160, height: 100, seed }));
});
startGeneratedSimulationButton.addEventListener("click", startGeneratedSimulation);
generatorBackButton.addEventListener("click", () => {
  worldGeneratorMenuElement.hidden = true;
  startMenuElement.hidden = false;
});
continueSimulationButton.addEventListener("click", () => {
  if (savedSimulation === undefined) {
    startMenuStatusElement.textContent = "Noch kein Spielstand vorhanden.";
    return;
  }
  startSimulation(SimulationEngine.fromSave(savedSimulation));
});
continueAutosaveButton.addEventListener("click", () => {
  if (savedAutosave === undefined) {
    startMenuStatusElement.textContent = "Noch kein Autosave vorhanden.";
    return;
  }
  startSimulation(SimulationEngine.fromSave(savedAutosave));
});
resumeSimulationButton.addEventListener("click", () => {
  running = true;
  pauseMenuElement.hidden = true;
  renderPlayButton();
  restartInterval();
});
saveSimulationButton.addEventListener("click", () => { saveCurrentSimulation().catch(() => { pauseMenuStatusElement.textContent = "Speichern fehlgeschlagen."; }); });
mainMenuButton.addEventListener("click", () => {
  running = false;
  pauseMenuElement.hidden = true;
  startMenuElement.hidden = false;
  renderPlayButton();
});
globalThis.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !startMenuElement.hidden) return;
  if (pauseMenuElement.hidden) {
    running = false;
    pauseMenuElement.hidden = false;
    pauseMenuStatusElement.textContent = "";
    renderPlayButton();
    return;
  }
  running = true;
  pauseMenuElement.hidden = true;
  renderPlayButton();
  restartInterval();
});
patchElement.addEventListener("click", (event) => {
  const closePatch = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>("[data-close-patch]")?.dataset.closePatch
    : undefined;
  if (closePatch !== "true") return;
  selected = undefined;
  patchElement.hidden = true;
});
closeResidentLogButton.addEventListener("click", () => { residentLogPanelElement.hidden = true; });
toastContainerElement.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const target = event.target;
  const waterResidentId = target.closest<HTMLElement>("[data-water-toast-close]")?.dataset.waterToastClose;
  const deathResidentId = target.closest<HTMLElement>("[data-death-toast-close]")?.dataset.deathToastClose;
  const closeWorkerToast = target.closest<HTMLElement>("[data-worker-toast-close]")?.dataset.workerToastClose;
  if (waterResidentId === undefined && deathResidentId === undefined && closeWorkerToast === undefined) return;
  if (waterResidentId !== undefined) waterDiscoveryNotices.delete(waterResidentId);
  if (deathResidentId !== undefined) deathNotices.delete(deathResidentId);
  if (closeWorkerToast !== undefined) workerErrorNotice = "";
  renderWaterDiscoveryToasts();
});
residentLogSearchInput.addEventListener("input", () => {
  residentLogSearch = residentLogSearchInput.value.trim().toLocaleLowerCase("de-DE");
  draw();
});
showMovementLogsInput.addEventListener("change", () => {
  showMovementLogs = showMovementLogsInput.checked;
  draw();
});
residentListElement.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const toggleId = event.target.closest<HTMLElement>("[data-resident-toggle-id]")?.dataset.residentToggleId;
  if (toggleId !== undefined) {
    if (expandedResidents.has(toggleId)) expandedResidents.delete(toggleId);
    else expandedResidents.add(toggleId);
    renderSidebar(runtime.snapshot());
    residentListElement.querySelector<HTMLButtonElement>(`[data-resident-toggle-id="${toggleId}"]`)?.focus();
    return;
  }
  const logResidentId = event.target.closest<HTMLElement>("[data-resident-log-id]")?.dataset.residentLogId;
  if (logResidentId !== undefined) {
    const resident = runtime.snapshot().residents.find((candidate) => candidate.id === logResidentId);
    if (resident === undefined) return;
    loggedResidentId = resident.id;
    residentLogPanelElement.hidden = false;
    draw();
    return;
  }
  const residentId = event.target.closest<HTMLElement>("[data-resident-id]")?.dataset.residentId;
  const resident = runtime.snapshot().residents.find((candidate) => candidate.id === residentId);
  if (resident === undefined) return;
  loggedResidentId = resident.id;
  const { width, height } = canvas.getBoundingClientRect();
  const zoom = Math.max(camera.snapshot().zoom, 0.9);
  camera = new CameraController({
    x: resident.position.x * CELL_SIZE + CELL_SIZE / 2 - width / (2 * zoom),
    y: resident.position.y * CELL_SIZE + CELL_SIZE / 2 - height / (2 * zoom),
    zoom
  });
  selected = { ...resident.position };
  draw();
});
globalThis.addEventListener("resize", resize);
await loadSavedSimulation();
resize();
