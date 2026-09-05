interface DesktopBridge {
  appVersion(): Promise<string>;
  writeResidentLog(log: {
    time: number;
    clock: { day: number; hour: number; minute: number; phase: string };
    residents: Array<{
      id: string;
      name: string;
      log: Array<{ time: number; day: number; hour: number; minute: number; message: string }>;
    }>;
  }): Promise<void>;
}

interface Window {
  desktop: DesktopBridge;
}

declare var desktop: DesktopBridge;
