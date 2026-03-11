import { describe, expect, it } from "vitest";

import { buildIssueBody, MAX_BODY_SECTIONS } from "./features.lauf.js";

// ---------------------------------------------------------------------------
// buildIssueBody
// ---------------------------------------------------------------------------

describe("buildIssueBody", () => {
  it("should return null when there is no H1 title", () => {
    const result = buildIssueBody("## Section\nSome text");
    expect(result).toBeNull();
  });

  it("should return null for empty content", () => {
    const result = buildIssueBody("");
    expect(result).toBeNull();
  });

  it("should extract title and sections correctly", () => {
    const content = [
      "# My Feature",
      "",
      "## Overview",
      "This is the overview.",
      "",
      "## Details",
      "Some details here.",
    ].join("\n");

    const result = buildIssueBody(content);
    expect(result).not.toBeNull();
    const typedResult = result as { title: string; body: string };
    expect(typedResult.title).toBe("My Feature");
    expect(typedResult.body).toContain("# My Feature");
    expect(typedResult.body).toContain("## Overview");
    expect(typedResult.body).toContain("This is the overview.");
    expect(typedResult.body).toContain("## Details");
    expect(typedResult.body).toContain("Some details here.");
  });

  it("should respect MAX_BODY_SECTIONS limit", () => {
    expect(MAX_BODY_SECTIONS).toBe(3);

    const content = [
      "# Feature",
      "",
      "## Section 1",
      "Content 1",
      "",
      "## Section 2",
      "Content 2",
      "",
      "## Section 3",
      "Content 3",
      "",
      "## Section 4",
      "Content 4 should be excluded",
    ].join("\n");

    const result = buildIssueBody(content);
    expect(result).not.toBeNull();
    const typedResult = result as { title: string; body: string };
    expect(typedResult.body).toContain("## Section 1");
    expect(typedResult.body).toContain("## Section 2");
    expect(typedResult.body).toContain("## Section 3");
    expect(typedResult.body).not.toContain("## Section 4");
    expect(typedResult.body).not.toContain("Content 4");
  });

  it("should trim trailing whitespace in sections", () => {
    const content = ["# Feature", "", "## Overview", "Some text", "", "", ""].join("\n");

    const result = buildIssueBody(content);
    expect(result).not.toBeNull();
    const typedResult = result as { title: string; body: string };
    expect(typedResult.body).not.toMatch(/\n\n\n$/);
    expect(typedResult.body).toMatch(/\n$/);
  });
});
