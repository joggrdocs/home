import { describe, expect, it } from "vitest";

import type { Assignee, RoadmapItem } from "./readme.lauf.js";
import {
  buildDiffChanges,
  buildMarkdownTable,
  formatAssignee,
  formatTableRow,
  getStatusBadge,
  replaceTableContent,
} from "./readme.lauf.js";

// ---------------------------------------------------------------------------
// replaceTableContent
// ---------------------------------------------------------------------------

describe("replaceTableContent", () => {
  const START = "<!-- target:roadmap-table:start -->";
  const END = "<!-- target:roadmap-table:end -->";

  it("should replace content between markers", () => {
    const readme = `before\n${START}\nold table\n${END}\nafter`;
    const [error, result] = replaceTableContent(readme, "new table");
    expect(error).toBeNull();
    expect(result).toBe(`before\n${START}\nnew table\n${END}\nafter`);
  });

  it("should return error when start marker is missing", () => {
    const readme = `before\n${END}\nafter`;
    const [error, result] = replaceTableContent(readme, "new table");
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeNull();
    const typedError = error as Error;
    expect(typedError.message).toContain("Missing");
    expect(result).toBeNull();
  });

  it("should return error when end marker is missing", () => {
    const readme = `before\n${START}\nafter`;
    const [error, result] = replaceTableContent(readme, "new table");
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeNull();
    const typedError = error as Error;
    expect(typedError.message).toContain("Missing");
    expect(result).toBeNull();
  });

  it("should return error when markers are reversed", () => {
    const readme = `before\n${END}\nmiddle\n${START}\nafter`;
    const [error, result] = replaceTableContent(readme, "new table");
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeNull();
    const typedError = error as Error;
    expect(typedError.message).toContain("after end marker");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildMarkdownTable
// ---------------------------------------------------------------------------

describe("buildMarkdownTable", () => {
  const makeItem = (overrides: Partial<RoadmapItem> = {}): RoadmapItem => ({
    title: "Feature A",
    status: "In progress",
    issueNumber: 1,
    projectItemId: "item-1",
    assignees: [],
    ...overrides,
  });

  it("should build a table with a single item", () => {
    const result = buildMarkdownTable([makeItem()], "org", "repo", 42, "3");
    const lines = result.split("\n");
    expect(lines[0]).toBe("| Feature | Status | Assignee |");
    expect(lines[1]).toBe("| ------- | ------ | -------- |");
    expect(lines.length).toBe(3);
    expect(lines[2]).toContain("Feature A");
  });

  it("should build a table with multiple items", () => {
    const items = [
      makeItem({ title: "Feature A", issueNumber: 1 }),
      makeItem({ title: "Feature B", issueNumber: 2 }),
    ];
    const result = buildMarkdownTable(items, "org", "repo", 42, "3");
    const lines = result.split("\n");
    expect(lines.length).toBe(4);
    expect(lines[2]).toContain("Feature A");
    expect(lines[3]).toContain("Feature B");
  });

  it("should build a table with no items as header only", () => {
    const result = buildMarkdownTable([], "org", "repo", 42, "3");
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("| Feature | Status | Assignee |");
    expect(lines[1]).toBe("| ------- | ------ | -------- |");
  });
});

// ---------------------------------------------------------------------------
// formatTableRow
// ---------------------------------------------------------------------------

describe("formatTableRow", () => {
  it("should produce correct URL encoding and badge format", () => {
    const item: RoadmapItem = {
      title: "My Feature",
      status: "In progress",
      issueNumber: 10,
      projectItemId: "pid-123",
      assignees: [],
    };
    const result = formatTableRow(item, "my-org", "my-repo", 5, "3");
    expect(result).toContain("[My Feature]");
    expect(result).toContain("my-org");
    expect(result).toContain("my-repo");
    expect(result).toContain("itemId=pid-123");
    expect(result).toContain("issue=my-org%7Cmy-repo%7C10");
    expect(result).toContain("img.shields.io/badge/");
    expect(result).toContain("In%20Progress");
  });
});

// ---------------------------------------------------------------------------
// formatAssignee
// ---------------------------------------------------------------------------

describe("formatAssignee", () => {
  const makeAssignee = (login: string): Assignee => ({
    login,
    avatarUrl: `https://github.com/${login}.png?size=48`,
    profileUrl: `https://github.com/${login}`,
  });

  it("should return badge for exactly one assignee", () => {
    const result = formatAssignee([makeAssignee("alice")]);
    expect(result).toContain("@alice");
    expect(result).toContain("img.shields.io/badge/");
    expect(result).toContain("https://github.com/alice");
  });

  it("should return empty string for zero assignees", () => {
    const result = formatAssignee([]);
    expect(result).toBe("");
  });

  it("should return empty string for multiple assignees", () => {
    const result = formatAssignee([makeAssignee("alice"), makeAssignee("bob")]);
    expect(result).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getStatusBadge
// ---------------------------------------------------------------------------

describe("getStatusBadge", () => {
  it('should return correct badge for "Idea"', () => {
    const badge = getStatusBadge("Idea");
    expect(badge.label).toBe("Idea");
    expect(badge.color).toBe("8a04ed");
  });

  it('should return correct badge for "Upcoming"', () => {
    const badge = getStatusBadge("Upcoming");
    expect(badge.label).toBe("Upcoming");
    expect(badge.color).toBe("0C1565");
  });

  it('should return correct badge for "Planned"', () => {
    const badge = getStatusBadge("Planned");
    expect(badge.label).toBe("Planned");
    expect(badge.color).toBe("0C1565");
  });

  it('should return correct badge for "In progress"', () => {
    const badge = getStatusBadge("In progress");
    expect(badge.label).toBe("In Progress");
    expect(badge.color).toBe("e85d04");
  });

  it('should return correct badge for "Released"', () => {
    const badge = getStatusBadge("Released");
    expect(badge.label).toBe("Released");
    expect(badge.color).toBe("00a67e");
  });

  it("should return fallback badge for unknown status", () => {
    const badge = getStatusBadge("SomethingElse");
    expect(badge.label).toBe("SomethingElse");
    expect(badge.color).toBe("5a347b");
  });
});

// ---------------------------------------------------------------------------
// buildDiffChanges
// ---------------------------------------------------------------------------

describe("buildDiffChanges", () => {
  const makeAssignee = (login: string): Assignee => ({
    login,
    avatarUrl: `https://github.com/${login}.png?size=48`,
    profileUrl: `https://github.com/${login}`,
  });

  it("should include assignees in detail when present", () => {
    const items: readonly RoadmapItem[] = [
      {
        title: "Feature A",
        status: "In progress",
        issueNumber: 1,
        projectItemId: "item-1",
        assignees: [makeAssignee("alice")],
      },
    ];
    const changes = buildDiffChanges(items);
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe("modify");
    expect(changes[0].label).toBe("Feature A");
    expect(changes[0].detail).toContain("@alice");
  });

  it("should not include assignees in detail when empty", () => {
    const items: readonly RoadmapItem[] = [
      {
        title: "Feature B",
        status: "Planned",
        issueNumber: 2,
        projectItemId: "item-2",
        assignees: [],
      },
    ];
    const changes = buildDiffChanges(items);
    expect(changes.length).toBe(1);
    expect(changes[0].detail).toBe("Planned");
  });
});
