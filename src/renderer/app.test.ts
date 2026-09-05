import { describe, expect, it, vi } from "vitest";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  clientX: number;
  clientY: number;
  currentTarget: FakeElement;
  deltaY: number;
  pointerId: number;
  preventDefault: ReturnType<typeof vi.fn>;
  target: FakeElement;
}

class FakeElement {
  public readonly classList = { add: vi.fn(), remove: vi.fn() };
  public readonly dataset: Record<string, string> = {};
  public innerHTML = "";
  public textContent = "";
  public title = "";
  public value = "";
  public hidden = false;
  public readonly style = { left: "", top: "" };
  private readonly listeners = new Map<string, Listener>();

  public addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  public appendChild(): void {}

  public querySelector(): null { return null; }

  public closest(): FakeElement {
    return this;
  }

  public emit(type: string, properties: Partial<FakeEvent> = {}): FakeEvent {
    const event: FakeEvent = {
      clientX: 0,
      clientY: 0,
      currentTarget: this,
      deltaY: 0,
      pointerId: 1,
      preventDefault: vi.fn(),
      target: this,
      ...properties
    };
    this.listeners.get(type)?.(event);
    return event;
  }

  public getBoundingClientRect(): { height: number; left: number; top: number; width: number } {
    return { height: 768, left: 0, top: 0, width: 1024 };
  }
}

class FakeCanvasContext {
  public fillStyle = "";
  public imageSmoothingEnabled = true;
  public lineWidth = 1;
  public strokeStyle = "";
  public readonly clearRect = vi.fn();
  public readonly fillRect = vi.fn();
  public readonly restore = vi.fn();
  public readonly save = vi.fn();
  public readonly scale = vi.fn();
  public readonly setTransform = vi.fn();
  public readonly strokeRect = vi.fn();
  public readonly translate = vi.fn();
}

class FakeCanvasElement extends FakeElement {
  public height = 0;
  public width = 0;
  public readonly context = new FakeCanvasContext();

  public getContext(): FakeCanvasContext {
    return this.context;
  }

  public setPointerCapture(): void {}
}

class FakeInputElement extends FakeElement {}
class FakeSelectElement extends FakeElement {}

const createRendererEnvironment = (): {
  canvas: FakeCanvasElement;
  elements: Map<string, FakeElement>;
  intervalCallback: () => void;
  resize: () => void;
  writeResidentLog: ReturnType<typeof vi.fn>;
} => {
  const canvas = new FakeCanvasElement();
  const elements = new Map<string, FakeElement>([
    ["#app", new FakeElement()],
    ["#clock", new FakeElement()],
    ["#close-resident-log", new FakeElement()],
    ["#patch", new FakeElement()],
    ["#play", new FakeElement()],
    ["#population", new FakeElement()],
    ["#resident-log", new FakeElement()],
    ["#resident-log-panel", new FakeElement()],
    ["#resident-log-search", new FakeInputElement()],
    ["#resident-log-title", new FakeElement()],
    ["#residents", new FakeElement()],
    ["#speed-fast", new FakeElement()],
    ["#speed-normal", new FakeElement()],
    ["#speed-very-fast", new FakeElement()],
    ["#time", new FakeElement()],
    ["#world", canvas]
  ]);

  let intervalCallback = (): void => {};
  let resize = (): void => {};
  const writeResidentLog = vi.fn(async (): Promise<void> => {});
  const document = {
    createElement: (): FakeElement => new FakeElement(),
    head: new FakeElement(),
    querySelector: (selector: string): FakeElement | null => elements.get(selector) ?? null
  };
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
  vi.stubGlobal("HTMLInputElement", FakeInputElement);
  vi.stubGlobal("HTMLSelectElement", FakeSelectElement);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("desktop", { writeResidentLog });
  vi.stubGlobal("addEventListener", (type: string, listener: () => void): void => {
    if (type === "resize") resize = listener;
  });
  vi.stubGlobal("clearInterval", vi.fn());
  vi.stubGlobal("setInterval", (callback: () => void): number => {
    intervalCallback = callback;
    return 1;
  });
  return { canvas, elements, intervalCallback: (): void => intervalCallback(), resize: (): void => resize(), writeResidentLog };
};

describe("LifeSim renderer", () => {
  it("renders the simulation and supports its primary map controls", async () => {
    const environment = createRendererEnvironment();

    await import("./app.js");

    expect(environment.elements.get("#clock")?.innerHTML).toContain("Tag 1 · 06:00");
    expect(environment.elements.get("#clock")?.innerHTML).toContain("time-of-day-icon");
    expect(environment.elements.get("#clock")?.innerHTML).toContain("☼");
    expect(environment.elements.get("#clock")?.title).toBe("0 Ticks vergangen.");
    expect(environment.elements.get("#clock")?.dataset.tooltip).toBe("0 Ticks vergangen.");
    expect(environment.elements.get("#population")?.textContent).toBe("1");
    expect(environment.elements.get("#app")?.innerHTML).not.toContain('class="topbar"');
    expect(environment.elements.get("#app")?.innerHTML).not.toContain("Intervention");
    expect(environment.elements.get("#app")?.innerHTML).not.toContain('id="donate"');
    expect(environment.elements.get("#app")?.innerHTML).not.toContain('id="step"');
    expect(environment.elements.get("#app")?.innerHTML).not.toContain('id="zoom"');
    expect(environment.elements.get("#app")?.innerHTML).not.toContain("Neue Welt");
    expect(environment.elements.get("#app")?.innerHTML).not.toContain('id="generate-world"');
    expect(environment.elements.get("#app")?.innerHTML).toContain('class="map-controls"');
    expect(environment.elements.get("#app")?.innerHTML).toContain('class="icon-control pause-control"');
    expect(environment.elements.get("#app")?.innerHTML).toContain('id="speed-very-fast"');
    expect(environment.elements.get("#play")?.textContent).toBe("Ⅱ");
    const residentMarkup = environment.elements.get("#residents")?.innerHTML ?? "";
    expect(residentMarkup).toContain("Nia");
    expect(residentMarkup).not.toContain("Teo");
    expect(residentMarkup).not.toContain("Mira");
    expect(residentMarkup).toContain('class="resident-card"');
    expect(residentMarkup.match(/<progress/g)).toHaveLength(3);
    expect(residentMarkup).toContain('aria-label="Fitness: 70 %"');
    expect(residentMarkup).toContain('aria-label="Sättigung: 70 %"');
    expect(residentMarkup).toContain('aria-label="Gesundheit: 100 %"');
    expect(residentMarkup).toContain("⚡");
    expect(residentMarkup).toContain("🍲");
    expect(residentMarkup).toContain("♥");
    expect(residentMarkup).toContain("Schläft");
    expect(residentMarkup).toContain('class="resident-activity"');
    expect(residentMarkup).not.toContain("Bewohner · sleeping");
    expect(residentMarkup).toContain('class="resident-log-button"');
    expect(residentMarkup).toContain("Log öffnen");
    expect(residentMarkup).not.toContain('class="resident-log"');
    expect(residentMarkup).not.toContain("Log:");
    expect(residentMarkup).toContain('aria-expanded="false"');
    expect(residentMarkup).toContain('id="resident-details-nia" hidden');
    const disclosureButton = new FakeElement();
    disclosureButton.dataset.residentToggleId = "nia";
    environment.elements.get("#residents")?.emit("click", { target: disclosureButton });
    expect(environment.elements.get("#residents")?.innerHTML).toContain('aria-expanded="true"');
    expect(environment.elements.get("#residents")?.innerHTML).not.toContain('id="resident-details-nia" hidden');
    expect(environment.elements.get("#resident-log-panel")?.hidden).toBe(true);
    const patchTooltip = environment.elements.get("#patch");
    if (patchTooltip === undefined) throw new Error("The renderer test fixture is incomplete");
    expect(patchTooltip.hidden).toBe(true);
    expect(environment.canvas.context.fillRect).toHaveBeenCalled();

    environment.intervalCallback();
    expect(environment.elements.get("#time")?.textContent).toBe("1");
    expect(environment.elements.get("#clock")?.title).toBe("1 Tick vergangen.");
    expect(environment.elements.get("#clock")?.dataset.tooltip).toBe("1 Tick vergangen.");
    expect(environment.writeResidentLog).toHaveBeenCalledWith(expect.objectContaining({ time: 1 }));
    expect(environment.elements.get("#resident-log")?.innerHTML).toContain("Tag 1 · 06:15");
    expect(environment.elements.get("#resident-log")?.innerHTML).toContain("Wacht auf.");
    expect(environment.elements.get("#residents")?.innerHTML).toContain("Frühstück / Vorräte");

    expect(environment.elements.get("#residents")?.innerHTML).toContain('aria-expanded="true"');
    environment.elements.get("#residents")?.emit("click", { target: disclosureButton });
    expect(environment.elements.get("#residents")?.innerHTML).toContain('aria-expanded="false"');
    expect(environment.elements.get("#residents")?.innerHTML).toContain('id="resident-details-nia" hidden');

    environment.intervalCallback();
    expect(environment.elements.get("#time")?.textContent).toBe("2");
    expect(environment.elements.get("#resident-log")?.innerHTML).toContain("Wacht auf.");
    expect(environment.elements.get("#resident-log")?.innerHTML).toContain("Beginnt zu arbeiten.");

    environment.elements.get("#play")?.emit("click");
    expect(environment.elements.get("#play")?.textContent).toBe("▶");
    environment.elements.get("#play")?.emit("click");
    expect(environment.elements.get("#play")?.textContent).toBe("Ⅱ");

    const fastSpeedButton = environment.elements.get("#speed-fast");
    if (fastSpeedButton === undefined) throw new Error("The renderer test fixture is incomplete");
    fastSpeedButton.emit("click");
    expect(fastSpeedButton.classList.add).toHaveBeenCalledWith("selected");

    const wheelEvent = environment.canvas.emit("wheel", { clientX: 200, clientY: 160, deltaY: -100 });
    expect(wheelEvent.preventDefault).toHaveBeenCalled();

    environment.canvas.emit("pointerdown", { clientX: 200, clientY: 160 });
    environment.canvas.emit("pointerup", { clientX: 200, clientY: 160 });
    expect(patchTooltip.hidden).toBe(false);
    expect(patchTooltip.style.left).not.toBe("");
    expect(patchTooltip.style.top).not.toBe("");
    expect(patchTooltip.innerHTML).not.toContain("Klicke auf einen Patch");

    const residentButton = new FakeElement();
    residentButton.dataset.residentId = "nia";
    environment.canvas.context.strokeRect.mockClear();
    environment.elements.get("#residents")?.emit("click", { target: residentButton });
    expect(environment.canvas.context.strokeRect).toHaveBeenCalled();

    const residentIcon = new FakeElement();
    residentIcon.dataset.residentLogId = "nia";
    environment.elements.get("#residents")?.emit("click", { target: residentIcon });
    expect(environment.elements.get("#resident-log-panel")?.hidden).toBe(false);
    expect(environment.elements.get("#resident-log-title")?.textContent).toBe("Aktivitätslog · Nia");
    const logSearch = environment.elements.get("#resident-log-search");
    if (logSearch === undefined) throw new Error("The renderer test fixture is incomplete");
    logSearch.value = "auf";
    logSearch.emit("input");
    expect(environment.elements.get("#resident-log")?.innerHTML).toContain("Wacht auf.");
    expect(environment.elements.get("#resident-log")?.innerHTML).not.toContain("Beginnt zu arbeiten.");
    environment.elements.get("#close-resident-log")?.emit("click");
    expect(environment.elements.get("#resident-log-panel")?.hidden).toBe(true);

    environment.resize();

    expect(environment.elements.get("#population")?.textContent).toBe("1");
    expect(environment.canvas.width).toBe(1024);
    expect(environment.canvas.height).toBe(768);

    vi.unstubAllGlobals();
    vi.resetModules();
  });
});
