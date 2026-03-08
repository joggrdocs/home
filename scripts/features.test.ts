import { describe, expect, it } from "vitest";

import { buildIssueBody, MAX_BODY_SECTIONS } from "./features.lauf.js";

// ---------------------------------------------------------------------------
// buildIssueBody
// ---------------------------------------------------------------------------

describe("buildIssueBody", () => {
  it("returns null when there is no H1 title", () => {
    const result = buildIssueBody("## Section\nSome text");
    expect(result).toBeNull();
  });

  it("returns null for empty content", () => {
    const result = buildIssueBody("");
    expect(result).toBeNull();
  });

  it("extracts title and sections correctly", () => {
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
    expect(result?.title).toBe("My Feature");
    expect(result?.body).toContain("# My Feature");
    expect(result?.body).toContain("## Overview");
    expect(result?.body).toContain("This is the overview.");
    expect(result?.body).toContain("## Details");
    expect(result?.body).toContain("Some details here.");
  });

  it("respects MAX_BODY_SECTIONS limit", () => {
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
    expect(result?.body).toContain("## Section 1");
    expect(result?.body).toContain("## Section 2");
    expect(result?.body).toContain("## Section 3");
    expect(result?.body).not.toContain("## Section 4");
    expect(result?.body).not.toContain("Content 4");
  });

  it("trims trailing whitespace in sections", () => {
    const content = ["# Feature", "", "## Overview", "Some text", "", "", ""].join("\n");

    const result = buildIssueBody(content);
    expect(result).not.toBeNull();
    expect(result?.body).not.toMatch(/\n\n\n$/);
    expect(result?.body).toMatch(/\n$/);
  });
});
