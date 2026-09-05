import { SimulationEngine, type SimulationSave, type SimulationSnapshot } from "../engine/simulation.js";
import type { SimulationWorkerEvent } from "../shared/simulation-worker-protocol.js";

type SnapshotListener = (snapshot: SimulationSnapshot) => void;

export class SimulationRuntime {
  private local: SimulationEngine | undefined;
  private worker: Worker | undefined;
  private current: SimulationSnapshot;
  private readonly pendingSave: Array<(save: SimulationSave) => void> = [];
  private currentSave: SimulationSave;
  private restarting = false;

  public constructor(initialSave: SimulationSave, private readonly onSnapshot: SnapshotListener, private readonly onError: (message: string) => void = () => {}) {
    this.currentSave = initialSave;
    this.local = SimulationEngine.fromSave(initialSave);
    this.current = this.local.snapshot();
    if (typeof Worker === "undefined") return;
    this.local = undefined;
    this.startWorker(initialSave);
  }

  public snapshot(): SimulationSnapshot { return this.current; }

  public advance(): void {
    if (this.local !== undefined) {
      this.local.advance();
      this.publish(this.local.snapshot());
      return;
    }
    this.worker?.postMessage({ type: "advance" });
  }

  public save(): Promise<SimulationSave> {
    if (this.local !== undefined) return Promise.resolve(this.local.save());
    return new Promise((resolve) => {
      this.pendingSave.push(resolve);
      this.worker?.postMessage({ type: "save" });
    });
  }

  public start(save: SimulationSave): void {
    if (this.worker !== undefined) {
      this.currentSave = save;
      this.worker.postMessage({ type: "start", save: { save } });
      return;
    }
    this.local = SimulationEngine.fromSave(save);
    this.current = this.local.snapshot();
    this.publish(this.current);
  }

  private handle(event: SimulationWorkerEvent): void {
    if (event.type === "saved") {
      this.currentSave = event.save;
      this.pendingSave.shift()?.(event.save);
      return;
    }
    if (event.type === "ready" || event.type === "snapshot") this.publish(event.snapshot);
    if (event.type === "error") this.failAndRestart(event.message);
  }

  private startWorker(save: SimulationSave): void {
    this.worker = new Worker(new URL("./simulation-worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<SimulationWorkerEvent>) => this.handle(event.data));
    this.worker.addEventListener("error", (event: ErrorEvent) => this.failAndRestart(event.message || "Simulation-Worker ist abgestürzt."));
    this.worker.postMessage({ type: "start", save: { save } });
  }

  private failAndRestart(message: string): void {
    this.onError(message);
    if (this.restarting) return;
    this.restarting = true;
    this.worker?.terminate();
    this.worker = undefined;
    globalThis.setTimeout(() => {
      this.restarting = false;
      this.startWorker(this.currentSave);
    }, 50);
  }

  private publish(snapshot: SimulationSnapshot): void {
    this.current = snapshot;
    this.onSnapshot(snapshot);
  }
}
