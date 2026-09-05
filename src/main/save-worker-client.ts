import { Worker } from "node:worker_threads";
import path from "node:path";
import type { SimulationSave } from "../engine/simulation.js";
import type { SaveSlot } from "./simulation-save.js";

type WorkerResponse = { id: number; ok: boolean; result?: SimulationSave; error?: string };
type PendingRequest = { resolve: (value: SimulationSave | void) => void; reject: (error: Error) => void };

export class SaveWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  public constructor() {
    this.worker = new Worker(path.join(__dirname, "save-worker.js"));
    this.worker.on("message", (response: WorkerResponse) => this.resolve(response));
    this.worker.on("error", (error) => this.rejectAll(error));
  }

  public write(workspace: string, save: SimulationSave, slot: SaveSlot): Promise<void> {
    return this.send({ type: "write", workspace, save, slot }) as Promise<void>;
  }

  public read(workspace: string, slot: SaveSlot): Promise<SimulationSave | undefined> {
    return this.send({ type: "read", workspace, slot }) as Promise<SimulationSave | undefined>;
  }

  public async close(): Promise<void> {
    await this.worker.terminate();
  }

  private send(request: WorkerRequest): Promise<SimulationSave | void> {
    const id = this.nextId++;
    return new Promise<SimulationSave | void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id });
    });
  }

  private resolve(response: WorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (pending === undefined) return;
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error ?? "Save worker failed."));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

type SaveRequest =
  | { id: number; type: "write"; workspace: string; save: SimulationSave; slot: SaveSlot }
  | { id: number; type: "read"; workspace: string; slot: SaveSlot };
type WorkerRequest =
  | { type: "write"; workspace: string; save: SimulationSave; slot: SaveSlot }
  | { type: "read"; workspace: string; slot: SaveSlot };
