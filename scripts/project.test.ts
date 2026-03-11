import { describe, expect, it } from "vitest";

import type { ConfigField, ConfigView } from "./lib/config.js";
import type { ProjectField, ProjectView } from "./lib/github-client.js";
import {
  BUILT_IN_FIELDS,
  computeFieldDiffs,
  convertGitHubFieldToConfig,
  convertGitHubViewToConfig,
  detectViewDrift,
  formatSortField,
} from "./project.lauf.js";

// ---------------------------------------------------------------------------
// computeFieldDiffs
// ---------------------------------------------------------------------------

describe("computeFieldDiffs", () => {
  const makeConfigField = (overrides: Partial<ConfigField> = {}): ConfigField => ({
    name: "Priority",
    type: "SINGLE_SELECT",
    ...overrides,
  });

  const makeGitHubField = (overrides: Partial<ProjectField> = {}): ProjectField => ({
    id: "field-1",
    name: "Priority",
    type: "SINGLE_SELECT",
    ...overrides,
  });

  it("should detect fields to create when in config but not in github", () => {
    const config = [makeConfigField({ name: "Priority" })];
    const github: ProjectField[] = [];
    const diff = computeFieldDiffs(config, github);
    expect(diff.toCreate.length).toBe(1);
    expect(diff.toCreate[0].name).toBe("Priority");
    expect(diff.toDelete.length).toBe(0);
    expect(diff.toUpdate.length).toBe(0);
  });

  it("should detect fields to delete when in github but not in config", () => {
    const config: ConfigField[] = [];
    const github = [makeGitHubField({ name: "OldField" })];
    const diff = computeFieldDiffs(config, github);
    expect(diff.toDelete.length).toBe(1);
    expect(diff.toDelete[0].name).toBe("OldField");
    expect(diff.toCreate.length).toBe(0);
  });

  it("should detect fields to update when options differ", () => {
    const config = [
      makeConfigField({
        name: "Priority",
        type: "SINGLE_SELECT",
        options: [{ name: "High" }, { name: "Low" }],
      }),
    ];
    const github = [
      makeGitHubField({
        name: "Priority",
        type: "SINGLE_SELECT",
        options: [{ id: "o1", name: "High" }],
      }),
    ];
    const diff = computeFieldDiffs(config, github);
    expect(diff.toUpdate.length).toBe(1);
    expect(diff.toUpdate[0].config.name).toBe("Priority");
  });

  it("should filter out built-in fields from github side", () => {
    const config: ConfigField[] = [];
    const github = [makeGitHubField({ name: "Title" })];
    expect(BUILT_IN_FIELDS.has("Title")).toBe(true);
    const diff = computeFieldDiffs(config, github);
    expect(diff.toDelete.length).toBe(0);
  });

  it("should return empty arrays when everything is in sync", () => {
    const config = [makeConfigField({ name: "Priority", type: "TEXT" })];
    const github = [makeGitHubField({ name: "Priority", type: "TEXT" })];
    const diff = computeFieldDiffs(config, github);
    expect(diff.toCreate.length).toBe(0);
    expect(diff.toDelete.length).toBe(0);
    expect(diff.toUpdate.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectViewDrift
// ---------------------------------------------------------------------------

describe("detectViewDrift", () => {
  const makeConfigView = (overrides: Partial<ConfigView> = {}): ConfigView => ({
    name: "Board",
    layout: "BOARD",
    groupBy: "Status",
    sortBy: null,
    fields: ["Title", "Status"],
    ...overrides,
  });

  const makeGitHubView = (overrides: Partial<ProjectView> = {}): ProjectView => ({
    id: "view-1",
    name: "Board",
    layout: "BOARD",
    filter: null,
    groupByFields: [{ name: "Status" }],
    sortByFields: [],
    visibleFields: [{ name: "Title" }, { name: "Status" }],
    ...overrides,
  });

  it("should detect views missing from github", () => {
    const config = [makeConfigView({ name: "Kanban" })];
    const github: ProjectView[] = [];
    const drift = detectViewDrift(config, github);
    expect(drift.length).toBe(1);
    expect(drift[0].type).toBe("missing_from_github");
    expect(drift[0].view).toBe("Kanban");
  });

  it("should detect views not in config", () => {
    const config: ConfigView[] = [];
    const github = [makeGitHubView({ name: "ExtraView" })];
    const drift = detectViewDrift(config, github);
    expect(drift.length).toBe(1);
    expect(drift[0].type).toBe("not_in_config");
    expect(drift[0].view).toBe("ExtraView");
  });

  it("should detect mismatched layout", () => {
    const config = [makeConfigView({ name: "Board", layout: "TABLE" })];
    const github = [makeGitHubView({ name: "Board", layout: "BOARD" })];
    const drift = detectViewDrift(config, github);
    expect(drift.length).toBe(1);
    expect(drift[0].type).toBe("mismatch");
    expect(drift[0].details).toContain("layout");
  });

  it("should detect mismatched groupBy", () => {
    const config = [makeConfigView({ name: "Board", groupBy: "Priority" })];
    const github = [makeGitHubView({ name: "Board", groupByFields: [{ name: "Status" }] })];
    const drift = detectViewDrift(config, github);
    expect(drift.length).toBe(1);
    expect(drift[0].type).toBe("mismatch");
    expect(drift[0].details).toContain("groupBy");
  });

  it("should detect mismatched sortBy", () => {
    const config = [
      makeConfigView({
        name: "Board",
        sortBy: { field: "Priority", direction: "ASC" },
      }),
    ];
    const github = [makeGitHubView({ name: "Board", sortByFields: [] })];
    const drift = detectViewDrift(config, github);
    expect(drift.length).toBe(1);
    expect(drift[0].type).toBe("mismatch");
    expect(drift[0].details).toContain("sortBy");
  });

  it("should return empty array when views are in sync", () => {
    const config = [makeConfigView()];
    const github = [makeGitHubView()];
    const drift = detectViewDrift(config, github);
    expect(drift.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// convertGitHubFieldToConfig
// ---------------------------------------------------------------------------

describe("convertGitHubFieldToConfig", () => {
  it("should convert a custom field to ConfigField", () => {
    const field: ProjectField = {
      id: "f1",
      name: "Priority",
      type: "SINGLE_SELECT",
      options: [
        { id: "o1", name: "High" },
        { id: "o2", name: "Low" },
      ],
    };
    const result = convertGitHubFieldToConfig(field);
    expect(result).not.toBeNull();
    const typedResult = result as ConfigField;
    expect(typedResult.name).toBe("Priority");
    expect(typedResult.type).toBe("SINGLE_SELECT");
    expect(typedResult.options).not.toBeUndefined();
    const typedOptions = typedResult.options as ReadonlyArray<{ readonly name: string }>;
    expect(typedOptions.length).toBe(2);
    expect(typedOptions[0].name).toBe("High");
  });

  it("should return null for a built-in field", () => {
    const field: ProjectField = {
      id: "f2",
      name: "Title",
      type: "TEXT",
    };
    const result = convertGitHubFieldToConfig(field);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// convertGitHubViewToConfig
// ---------------------------------------------------------------------------

describe("convertGitHubViewToConfig", () => {
  it("should convert a full view with sort, group, and filter", () => {
    const view: ProjectView = {
      id: "v1",
      name: "Backlog",
      layout: "TABLE",
      filter: "status:open",
      groupByFields: [{ name: "Status" }],
      sortByFields: [{ field: { name: "Priority" }, direction: "DESC" }],
      visibleFields: [{ name: "Title" }, { name: "Status" }, { name: "Priority" }],
    };
    const result = convertGitHubViewToConfig(view);
    expect(result.name).toBe("Backlog");
    expect(result.layout).toBe("TABLE");
    expect(result.groupBy).toBe("Status");
    expect(result.sortBy).toEqual({ field: "Priority", direction: "DESC" });
    expect(result.fields).toEqual(["Title", "Status", "Priority"]);
    expect(result.filter).toBe("status:open");
  });

  it("should handle view with no sort or group", () => {
    const view: ProjectView = {
      id: "v2",
      name: "Simple",
      layout: "BOARD",
      filter: null,
      groupByFields: [],
      sortByFields: [],
      visibleFields: [{ name: "Title" }],
    };
    const result = convertGitHubViewToConfig(view);
    expect(result.name).toBe("Simple");
    expect(result.groupBy).toBeNull();
    expect(result.sortBy).toBeNull();
    expect(result.filter).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// formatSortField
// ---------------------------------------------------------------------------

describe("formatSortField", () => {
  it("should format a sort object as a string", () => {
    const result = formatSortField({ field: "Priority", direction: "ASC" });
    expect(result).toBe("Priority ASC");
  });

  it('should return "none" for null', () => {
    const result = formatSortField(null);
    expect(result).toBe("none");
  });
});
