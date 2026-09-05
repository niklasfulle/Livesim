import { describe, expect, it } from "vitest";
import { CameraController } from "./camera.js";

describe("CameraController", () => {
  it("zooms around the mouse position so the focused world point stays fixed", () => {
    const camera = new CameraController({ x: 100, y: 50, zoom: 1 });

    camera.zoomAt({ x: 300, y: 200 }, 2);

    expect(camera.snapshot()).toEqual({ x: 250, y: 150, zoom: 2 });
  });

  it("pans in world units, so dragging remains natural at every zoom level", () => {
    const camera = new CameraController({ x: 10, y: 20, zoom: 2 });

    camera.panBy({ x: 40, y: -20 });

    expect(camera.snapshot()).toEqual({ x: -10, y: 30, zoom: 2 });
  });
});
