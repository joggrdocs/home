import { describe, it, expect } from "vitest";

import { compareStrings } from "./diff.js";

describe("compareStrings", () => {
  it("should return null when strings are equal", () => {
    const result = compareStrings("title", "Same", "Same");

    expect(result).toBeNull();
  });

  it("should return a DiffChange with type modify when strings differ", () => {
    const result = compareStrings("title", "Old Title", "New Title");

    expect(result).not.toBeNull();
    expect(result!.type).toBe("modify");
    expect(result!.label).toBe("title");
  });

  it("should format detail as quoted old to new with arrow", () => {
    const result = compareStrings("name", "Alice", "Bob");

    expect(result).not.toBeNull();
    expect(result!.detail).toBe('"Alice" \u2192 "Bob"');
  });
});
