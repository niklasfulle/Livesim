import { describe, expect, it } from "vitest";
import { grassTexture, sandTexture, treeTexture, waterTexture } from "./textures.js";

describe("map textures", () => {
  it("creates a varied top-down pixel texture for grass", () => {
    const texture = grassTexture(7, 11);

    expect(texture).toEqual(grassTexture(7, 11));
    expect(texture).not.toEqual(grassTexture(8, 11));
    expect(texture.length).toBeGreaterThan(25);
    expect(new Set(texture.map(({ color }) => color)).size).toBeGreaterThanOrEqual(5);
    expect(texture.every(({ color }) => !["#754a31", "#9b623c", "#603b2a"].includes(color))).toBe(true);
    expect(texture.slice(1).every(({ height, width, x, y }) =>
      x % 4 === 0 && y % 4 === 0 && width % 4 === 0 && height % 4 === 0
    )).toBe(true);
  });

  it("keeps the grass bright while preserving visible contrast", () => {
    const texture = grassTexture(7, 11);
    const brightness = (color: string): number => {
      const red = Number.parseInt(color.slice(1, 3), 16);
      const green = Number.parseInt(color.slice(3, 5), 16);
      const blue = Number.parseInt(color.slice(5, 7), 16);
      return (red + green + blue) / 3;
    };
    const paintedArea = texture.reduce((total, rectangle) => total + rectangle.width * rectangle.height, 0);
    const averageBrightness = texture.reduce((total, rectangle) =>
      total + brightness(rectangle.color) * rectangle.width * rectangle.height, 0) / paintedArea;

    expect(averageBrightness).toBeGreaterThan(95);
    expect(averageBrightness).toBeLessThan(145);
  });

  it("creates seamless water without horizontal border strips", () => {
    const texture = waterTexture(7, 11);

    expect(texture).toEqual(waterTexture(7, 11));
    expect(texture).not.toEqual(waterTexture(8, 11));
    expect(texture[0]).toMatchObject({ height: 63, width: 63, x: 0, y: 0 });
    expect(texture.slice(1).every(({ width }) => width < 63)).toBe(true);
    expect(new Set(texture.map(({ color }) => color)).size).toBeGreaterThanOrEqual(4);
  });

  it("creates seamless sand without horizontal border strips", () => {
    const texture = sandTexture(7, 11);

    expect(texture).toEqual(sandTexture(7, 11));
    expect(texture).not.toEqual(sandTexture(8, 11));
    expect(texture[0]).toMatchObject({ height: 63, width: 63, x: 0, y: 0 });
    expect(texture.slice(1).every(({ width }) => width < 63)).toBe(true);
    expect(new Set(texture.map(({ color }) => color)).size).toBeGreaterThanOrEqual(4);
  });

  it("creates a rounded tree crown that reaches into the surrounding patches", () => {
    const texture = treeTexture(7, 11, 400);
    const crown = texture.filter(({ part }) => part === "crown");
    const left = Math.min(...crown.map(({ x }) => x));
    const right = Math.max(...crown.map(({ width, x }) => x + width));
    const top = Math.min(...crown.map(({ y }) => y));
    const bottom = Math.max(...crown.map(({ height, y }) => y + height));
    const widestRow = Math.max(...crown.map(({ width }) => width));
    const topRow = crown.find(({ y }) => y === top);

    expect(texture).toEqual(treeTexture(7, 11, 400));
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(64);
    expect(top).toBeLessThan(0);
    expect(bottom).toBeGreaterThan(64);
    expect(topRow?.width).toBeLessThan(widestRow);
    expect(new Set(texture.map(({ color }) => color)).size).toBeGreaterThanOrEqual(7);
    expect(texture.some(({ part }) => part === "trunk")).toBe(true);
  });
});
