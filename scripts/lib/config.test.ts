import { readFile } from "node:fs/promises";

import { vi, describe, it, expect, beforeEach } from "vitest";

import type { ProjectConfig } from "./config.js";
import { readProjectConfig } from "./config.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const VALID_CONFIG = JSON.stringify({
  project: {
    owner: "test-owner",
    repo: "test-repo",
    number: 1,
    title: "Test Project",
    description: "A test project",
    visibility: "PUBLIC",
    readme: "README.md",
  },
  fields: [],
  views: [],
  statusMapping: {},
});

describe("readProjectConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return [null, config] for valid JSON", async () => {
    vi.mocked(readFile).mockResolvedValue(VALID_CONFIG);

    const [error, config] = await readProjectConfig("/project");

    expect(error).toBeNull();
    expect(config).not.toBeNull();
    const typedConfig = config as ProjectConfig;
    expect(typedConfig.project.owner).toBe("test-owner");
    expect(typedConfig.project.title).toBe("Test Project");
  });

  it("should return [Error, null] for malformed JSON", async () => {
    vi.mocked(readFile).mockResolvedValue("{ not valid json }}}");

    const [error, config] = await readProjectConfig("/project");

    expect(error).toBeInstanceOf(Error);
    expect(config).toBeNull();
  });

  it("should return [Error, null] when file is missing", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT: no such file"));

    const [error, config] = await readProjectConfig("/project");

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeNull();
    const typedError = error as Error;
    expect(typedError.message).toContain("ENOENT");
    expect(config).toBeNull();
  });
});
