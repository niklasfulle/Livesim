import { describe, expect, it } from "vitest";
import { orderResourcePatches } from "./render-order.js";

describe("resource rendering order", () => {
  it("always places berry bushes below trees regardless of map order", () => {
    const resources = [
      { ground: "forest" as const, x: 0, y: 0 },
      { ground: "berryBush" as const, x: 1, y: 0 },
      { ground: "forest" as const, x: 0, y: 1 },
      { ground: "berryBush" as const, x: 1, y: 1 }
    ];

    expect(orderResourcePatches(resources).map(({ ground }) => ground)).toEqual([
      "berryBush",
      "berryBush",
      "forest",
      "forest"
    ]);
  });
});
