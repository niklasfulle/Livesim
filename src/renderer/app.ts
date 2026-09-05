import "./style.css";
import { CameraController, type Point } from "../engine/camera.js";
import { SimulationEngine, type ResidentSeed, type SimulationSnapshot } from "../engine/simulation.js";
import { type Ground, World } from "../engine/world.js";
import { orderResourcePatches, type ResourceRenderPatch } from "./render-order.js";
import { grassTexture, sandTexture, type TextureRect, treeTexture, waterTexture } from "./textures.js";

const CELL_SIZE = 64;
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

const residents = (world: World): ResidentSeed[] => {
  const { width, height } = world.dimensions();
  const nearestLand = (target: { x: number; y: number }) => {
    let best = { x: 0, y: 0 };
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!world.isWalkable({ x, y })) continue;
        const distance = Math.abs(target.x - x) + Math.abs(target.y - y);
        if (distance < bestDistance) {
          best = { x, y };
          bestDistance = distance;
        }
      }
    }
    return best;
  };
  return [
    { id: "nia", name: "Nia", position: nearestLand({ x: Math.floor(width * 0.5), y: Math.floor(height * 0.5) }) }
  ];
};

const createSimulation = (width: number, height: number, seed: number): SimulationEngine => {
  const world = World.generate({ width, height, seed });
  return SimulationEngine.start({
    map: world.toAscii(),
    residents: residents(world)
  });
};

let simulation = createSimulation(160, 100, 729);

const appElement = requireElement("#app");
appElement.innerHTML = `
  <section class="workspace">
    <div class="map-area"><canvas id="world"></canvas><div class="map-controls"><div class="map-control-row"><button class="icon-control pause-control" id="play" aria-label="Simulation pausieren">Ⅱ</button><button class="icon-control speed-control selected" id="speed-normal" aria-label="Normales Tempo" aria-pressed="true"><span aria-hidden="true">▶</span><small>1</small></button><button class="icon-control speed-control" id="speed-fast" aria-label="Schnelles Tempo" aria-pressed="false"><span aria-hidden="true">▶</span><small>2</small></button><button class="icon-control speed-control" id="speed-very-fast" aria-label="Sehr schnelles Tempo" aria-pressed="false"><span aria-hidden="true">▶</span><small>3</small></button></div><span class="clock" id="clock">Tag 1 · 06:00</span></div><div class="patch-tooltip" id="patch" hidden></div><div class="map-hint">Ziehen: Karte bewegen · Mausrad: Zoom · Klick: Patch inspizieren</div></div>
  </section>
  <aside class="sidebar">
    <section class="section"><h2>Simulation</h2><div class="stats"><div class="stat"><b id="time">0</b><span>Ticks</span></div><div class="stat"><b id="population">0</b><span>Bewohner</span></div></div></section>
    <section class="section"><h2>Bewohner</h2><div id="residents"></div></section>
  </aside>
  <aside class="log-sidebar" id="resident-log-panel" hidden><div class="log-header"><h2 id="resident-log-title">Aktivitätslog</h2><button class="log-close" id="close-resident-log" aria-label="Aktivitätslog schließen">×</button></div><input class="log-search" id="resident-log-search" type="search" placeholder="Log durchsuchen" aria-label="Aktivitätslog durchsuchen" /><ol class="resident-history" id="resident-log"></ol></aside>`;

const canvas = requireCanvas("#world");
const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("Could not create a 2D canvas context");
}
const timeElement = requireElement("#time");
const populationElement = requireElement("#population");
const clockElement = requireElement("#clock");
const residentListElement = requireElement("#residents");
const residentLogPanelElement = requireElement("#resident-log-panel");
const residentLogTitleElement = requireElement("#resident-log-title");
const residentLogElement = requireElement("#resident-log");
const residentLogSearchInput = requireInput("#resident-log-search");
const closeResidentLogButton = requireElement("#close-resident-log");
const patchElement = requireElement("#patch");
const playButton = requireElement("#play");
const normalSpeedButton = requireElement("#speed-normal");
const fastSpeedButton = requireElement("#speed-fast");
const veryFastSpeedButton = requireElement("#speed-very-fast");
let camera = new CameraController({ x: 160, y: 120, zoom: 0.28 });
let running = true;
let tickDelay = 1000;
let selected: { x: number; y: number } | undefined;
let loggedResidentId = "nia";
let residentLogSearch = "";
const expandedResidents = new Set<string>();
let pointerStart: Point | undefined;
let lastPointer: Point | undefined;
let dragged = false;
let interval: ReturnType<typeof globalThis.setInterval> | undefined;

residentLogPanelElement.hidden = true;
patchElement.hidden = true;

const RESIDENT_COLOR = "#e3b35a";
const timeOfDayIcons: Record<SimulationSnapshot["clock"]["phase"], { icon: string; label: string }> = {
  dawn: { icon: "☼", label: "Morgengrauen" },
  day: { icon: "☀", label: "Tag" },
  dusk: { icon: "◒", label: "Abenddämmerung" },
  night: { icon: "☾", label: "Nacht" }
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
  const snapshot = simulation.snapshot();
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
  return `<div class="status-meter ${kind}"><span class="status-icon" aria-hidden="true">${icon}</span><span class="status-label">${label}</span><progress max="100" value="${percent}" aria-label="${label}: ${percent} %"></progress><output>${percent}%</output></div>`;
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
        ${statusMeterMarkup("health", "♥", "Gesundheit", resident.health)}
      </div>
      <div class="resident-data">
        <div class="resident-data-row"><span class="resident-data-title">Wissen</span><div class="resident-chips"><span class="resident-chip" aria-label="Bekannte Gewässer: ${resident.knownWaters.length} von 2">💧 ${resident.knownWaters.length}/2</span><span class="resident-chip" aria-label="Bekannte Bäume: ${resident.knownTrees.length} von 3">🌳 ${resident.knownTrees.length}/3</span><span class="resident-chip" aria-label="Bekannte Büsche: ${resident.knownBerryBushes.length} von 3">🫐 ${resident.knownBerryBushes.length}/3</span></div></div>
        <div class="resident-data-row"><span class="resident-data-title">Inventar</span><div class="resident-chips"><span class="resident-chip" title="Fisch">🐟 ${resident.inventory.fish}</span><span class="resident-chip" title="Holz">🪵 ${resident.inventory.wood}</span><span class="resident-chip" title="Pflanze">🌿 ${resident.inventory.plant}</span><span class="resident-chip" title="Beeren">🫐 ${resident.inventory.berries}</span><span class="resident-chip" title="Mahlzeit">🍲 ${resident.inventory.meals}</span></div></div>
      </div>
      <button class="resident-log-button" data-resident-log-id="${resident.id}" aria-label="Aktivitätslog von ${resident.name} öffnen"><span aria-hidden="true">☷</span> Log öffnen</button>
      <button class="resident-locate-button" data-resident-id="${resident.id}" aria-label="${resident.name} auf der Karte anzeigen">${facing} Auf Karte anzeigen</button>
      </div>
    </article>`;
};

const renderSidebar = (snapshot: SimulationSnapshot): void => {
  timeElement.textContent = String(snapshot.time);
  populationElement.textContent = String(snapshot.residents.length);
  const timeOfDay = timeOfDayIcons[snapshot.clock.phase];
  clockElement.innerHTML = `<span class="time-of-day-icon" role="img" aria-label="${timeOfDay.label}">${timeOfDay.icon}</span><span>Tag ${snapshot.clock.day} · ${String(snapshot.clock.hour).padStart(2, "0")}:${String(snapshot.clock.minute).padStart(2, "0")}</span>`;
  const tickTooltip = `${snapshot.time} ${snapshot.time === 1 ? "Tick" : "Ticks"} vergangen.`;
  clockElement.title = tickTooltip;
  clockElement.dataset.tooltip = tickTooltip;
  residentListElement.innerHTML = snapshot.residents.map((resident) => residentCardMarkup(resident, snapshot.world)).join("");
  const loggedResident = snapshot.residents.find((resident) => resident.id === loggedResidentId) ?? snapshot.residents[0];
  if (loggedResident === undefined) {
    residentLogTitleElement.textContent = "Aktivitätslog";
    residentLogElement.innerHTML = "<li>Noch keine Bewohner.</li>";
  } else {
    residentLogTitleElement.textContent = `Aktivitätslog · ${loggedResident.name}`;
    const matchingEntries = loggedResident.log.filter((entry) => {
      const searchableEntry = `${entry.day} ${entry.hour} ${entry.minute} ${entry.message}`.toLocaleLowerCase("de-DE");
      return searchableEntry.includes(residentLogSearch);
    });
    residentLogElement.innerHTML = loggedResident.log.length === 0
      ? "<li>Noch keine Aktionen.</li>"
      : matchingEntries.length === 0
        ? "<li>Keine passenden Einträge.</li>"
        : matchingEntries.map((entry) => `<li><time>Tag ${entry.day} · ${String(entry.hour).padStart(2, "0")}:${String(entry.minute).padStart(2, "0")}</time><span>${entry.message}</span></li>`).join("");
  }
};

const patchInspectorMarkup = (snapshot: SimulationSnapshot, point: Point): string => {
  const patch = snapshot.world[point.y]?.[point.x];
  if (patch === undefined) return "Außerhalb der Karte";

  const homeowner = snapshot.residents.find((resident) => resident.home.x === point.x && resident.home.y === point.y);
  if (homeowner === undefined) {
    return `<b>${patch.ground}</b><br>Position: ${point.x}/${point.y}<br>Bestand: ${patch.stock}`;
  }
  return `<b>Hütte von ${homeowner.name}</b><br>Position: ${point.x}/${point.y}<br>Fisch ${homeowner.homeInventory.fish} · Holz ${homeowner.homeInventory.wood}<br>Pflanze ${homeowner.homeInventory.plant} · Beeren ${homeowner.homeInventory.berries} · Mahlzeit ${homeowner.homeInventory.meals}`;
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
  patchElement.style.left = `${Math.max(8, Math.min(viewport.width - 218, patchLeft + patchSize + 8))}px`;
  patchElement.style.top = `${Math.max(8, Math.min(viewport.height - 118, patchTop + 8))}px`;
  patchElement.hidden = false;
};

const persistResidentLog = (): void => {
  const snapshot = simulation.snapshot();
  void desktop.writeResidentLog({
    time: snapshot.time,
    clock: snapshot.clock,
    residents: snapshot.residents.map((resident) => ({ id: resident.id, name: resident.name, log: resident.log }))
  }).catch(() => undefined);
};

const step = (): void => { simulation.advance(); persistResidentLog(); draw(); };
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
closeResidentLogButton.addEventListener("click", () => { residentLogPanelElement.hidden = true; });
residentLogSearchInput.addEventListener("input", () => {
  residentLogSearch = residentLogSearchInput.value.trim().toLocaleLowerCase("de-DE");
  draw();
});
residentListElement.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const toggleId = event.target.closest<HTMLElement>("[data-resident-toggle-id]")?.dataset.residentToggleId;
  if (toggleId !== undefined) {
    if (expandedResidents.has(toggleId)) expandedResidents.delete(toggleId);
    else expandedResidents.add(toggleId);
    renderSidebar(simulation.snapshot());
    residentListElement.querySelector<HTMLButtonElement>(`[data-resident-toggle-id="${toggleId}"]`)?.focus();
    return;
  }
  const logResidentId = event.target.closest<HTMLElement>("[data-resident-log-id]")?.dataset.residentLogId;
  if (logResidentId !== undefined) {
    const resident = simulation.snapshot().residents.find((candidate) => candidate.id === logResidentId);
    if (resident === undefined) return;
    loggedResidentId = resident.id;
    residentLogPanelElement.hidden = false;
    draw();
    return;
  }
  const residentId = event.target.closest<HTMLElement>("[data-resident-id]")?.dataset.residentId;
  const resident = simulation.snapshot().residents.find((candidate) => candidate.id === residentId);
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
persistResidentLog();
restartInterval(); resize();
