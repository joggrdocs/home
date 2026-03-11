import { readFile } from "node:fs/promises";

import { vi, describe, it, expect, beforeEach } from "vitest";

import type { Queries } from "./query-loader.js";
import { loadQueries } from "./query-loader.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("loadQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return [null, queries] when all files exist", async () => {
    vi.mocked(readFile).mockResolvedValue("query { field }");

    const [error, queries] = await loadQueries({ packageDir: "/project" });

    expect(error).toBeNull();
    expect(queries).not.toBeNull();
    const typedQueries = queries as Queries;
    expect(typedQueries.getProject).toBe("query { field }");
    expect(typedQueries.listProjectViews).toBe("query { field }");
    expect(typedQueries.listProjectItems).toBe("query { field }");
    expect(typedQueries.updateFieldOptions).toBe("query { field }");
  });

  it("should return [Error, null] when a file is missing", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file"));

    const [error, queries] = await loadQueries({ packageDir: "/project" });

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeNull();
    const typedError = error as Error;
    expect(typedError.message).toContain("ENOENT");
    expect(queries).toBeNull();
  });
});
