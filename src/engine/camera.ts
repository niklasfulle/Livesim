export interface Point {
  x: number;
  y: number;
}

export interface CameraSnapshot extends Point {
  zoom: number;
}

export class CameraController {
  private x: number;
  private y: number;
  private zoom: number;

  public constructor(initial: CameraSnapshot) {
    this.x = initial.x;
    this.y = initial.y;
    this.zoom = initial.zoom;
  }

  public zoomAt(screenPoint: Point, nextZoom: number): void {
    const worldPoint = {
      x: this.x + screenPoint.x / this.zoom,
      y: this.y + screenPoint.y / this.zoom
    };

    this.zoom = nextZoom;
    this.x = worldPoint.x - screenPoint.x / this.zoom;
    this.y = worldPoint.y - screenPoint.y / this.zoom;
  }

  public panBy(screenDelta: Point): void {
    this.x -= screenDelta.x / this.zoom;
    this.y -= screenDelta.y / this.zoom;
  }

  public snapshot(): CameraSnapshot {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }
}
