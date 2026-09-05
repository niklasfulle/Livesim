import { describe, expect, it } from "vitest";
import { newlyDeadResidents } from "./toasts.js";

describe("resident event toasts", () => {
  it("returns each resident exactly when they first become dead", () => {
    const previous = [
      { id: "nia", name: "Nia", state: "working" },
      { id: "mika", name: "Mika", state: "dead" }
    ];
    const current = [
      { id: "nia", name: "Nia", state: "dead" },
      { id: "mika", name: "Mika", state: "dead" }
    ];

    expect(newlyDeadResidents(previous, current)).toEqual([{ id: "nia", name: "Nia" }]);
  });
});
