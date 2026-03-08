import { describe, it, expect } from "vitest";

import { reverseStatusMapping } from "./status.js";

describe("reverseStatusMapping", () => {
  it("should reverse a standard mapping correctly", () => {
    const mapping = { todo: "Todo", inProgress: "In Progress", done: "Done" };
    const result = reverseStatusMapping(mapping);

    expect(result.get("Todo")).toBe("todo");
    expect(result.get("In Progress")).toBe("inProgress");
    expect(result.get("Done")).toBe("done");
  });

  it("should return an empty Map for an empty mapping", () => {
    const result = reverseStatusMapping({});

    expect(result.size).toBe(0);
  });

  it("should reverse all entries in a multi-entry mapping", () => {
    const mapping = { a: "x", b: "y", c: "z" };
    const result = reverseStatusMapping(mapping);

    expect(result.size).toBe(3);
    expect(result.get("x")).toBe("a");
    expect(result.get("y")).toBe("b");
    expect(result.get("z")).toBe("c");
  });
});
