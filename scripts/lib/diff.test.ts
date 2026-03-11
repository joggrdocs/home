import { describe, it, expect } from "vitest";

import type { DiffChange } from "./diff.js";
import { compareStrings } from "./diff.js";

describe("compareStrings", () => {
  it("should return null when strings are equal", () => {
    const result = compareStrings("title", "Same", "Same");

    expect(result).toBeNull();
  });

  it("should return a DiffChange with type modify when strings differ", () => {
    const result = compareStrings("title", "Old Title", "New Title");

    expect(result).not.toBeNull();
    const typedResult = result as DiffChange;
    expect(typedResult.type).toBe("modify");
    expect(typedResult.label).toBe("title");
  });

  it("should format detail as quoted old to new with arrow", () => {
    const result = compareStrings("name", "Alice", "Bob");

    expect(result).not.toBeNull();
    const typedResult = result as DiffChange;
    expect(typedResult.detail).toBe('"Alice" \u2192 "Bob"');
  });
});
