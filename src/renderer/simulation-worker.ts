import { SimulationEngine } from "../engine/simulation.js";
import { isSimulationCommand, type SimulationCommand, type SimulationWorkerEvent } from "../shared/simulation-worker-protocol.js";

let simulation: SimulationEngine | undefined;
let paused = false;

const emit = (event: SimulationWorkerEvent): void => self.postMessage(event);

const startSimulation = (command: Extract<SimulationCommand, { type: "start" }>): void => {
  simulation = "save" in command.save ? SimulationEngine.fromSave(command.save.save) : SimulationEngine.start(command.save);
  paused = false;
  emit({ type: "ready", snapshot: simulation.snapshot() });
};

const requireSimulation = (): SimulationEngine => {
  if (simulation === undefined) throw new Error("Simulation wurde noch nicht gestartet.");
  return simulation;
};

const handleRunningCommand = (command: Exclude<SimulationCommand, { type: "start" }>): void => {
  const current = requireSimulation();
  if (command.type === "advance") {
    if (!paused) current.advance();
    emit({ type: "snapshot", snapshot: current.snapshot() });
  } else if (command.type === "pause") {
    paused = true;
  } else if (command.type === "resume") {
    paused = false;
  } else {
    emit({ type: "saved", save: current.save() });
  }
};

const handleCommand = (command: SimulationCommand): void => {
  if (command.type === "start") startSimulation(command);
  else handleRunningCommand(command);
};

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.origin !== "" && event.origin !== self.location.origin) {
    emit({ type: "error", message: "Nachricht aus einer nicht erlaubten Quelle." });
    return;
  }
  if (!isSimulationCommand(event.data)) {
    emit({ type: "error", message: "Unbekannter Simulationsbefehl." });
    return;
  }
  const command: SimulationCommand = event.data;
  try {
    handleCommand(command);
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
