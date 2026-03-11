import { describe, it, expect } from "vitest";

import { extractTitle, parseFrontmatter, updateFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("should parse valid frontmatter and return content", () => {
    const raw = "---\ntitle: Hello\nstatus: draft\n---\n\n# Hello World";
    const result = parseFrontmatter<{ title: string; status: string }>(raw);

    expect(result).not.toBeNull();
    const typedResult = result as {
      frontmatter: { title: string; status: string };
      content: string;
    };
    expect(typedResult.frontmatter).toEqual({ title: "Hello", status: "draft" });
    expect(typedResult.content).toBe("# Hello World");
  });

  it("should return null when no frontmatter is present", () => {
    const raw = "# Just a heading\n\nSome content.";
    const result = parseFrontmatter(raw);

    expect(result).toBeNull();
  });

  it("should return null for an empty YAML block", () => {
    const raw = "---\n\n---\n\nBody text";
    const result = parseFrontmatter(raw);

    expect(result).toBeNull();
  });

  it("should handle multi-line content after frontmatter", () => {
    const raw = "---\nkey: value\n---\n\nLine one\n\nLine two\n\nLine three";
    const result = parseFrontmatter<{ key: string }>(raw);

    expect(result).not.toBeNull();
    const typedResult = result as { frontmatter: { key: string }; content: string };
    expect(typedResult.frontmatter).toEqual({ key: "value" });
    expect(typedResult.content).toBe("Line one\n\nLine two\n\nLine three");
  });
});

describe("updateFrontmatter", () => {
  it("should update an existing field in frontmatter", () => {
    const raw = "---\ntitle: Old\nstatus: draft\n---\n\n# Content";
    const result = updateFrontmatter(raw, { title: "New" });

    const parsed = parseFrontmatter<{ title: string; status: string }>(result);
    expect(parsed).not.toBeNull();
    const typedParsed = parsed as {
      frontmatter: { title: string; status: string };
      content: string;
    };
    expect(typedParsed.frontmatter.title).toBe("New");
    expect(typedParsed.frontmatter.status).toBe("draft");
  });

  it("should add a new field to frontmatter", () => {
    const raw = "---\ntitle: Hello\n---\n\n# Content";
    const result = updateFrontmatter(raw, { priority: "high" });

    const parsed = parseFrontmatter<{ title: string; priority: string }>(result);
    expect(parsed).not.toBeNull();
    const typedParsed = parsed as {
      frontmatter: { title: string; priority: string };
      content: string;
    };
    expect(typedParsed.frontmatter.priority).toBe("high");
    expect(typedParsed.frontmatter.title).toBe("Hello");
  });

  it("should return unchanged string when no frontmatter exists", () => {
    const raw = "# No frontmatter here";
    const result = updateFrontmatter(raw, { title: "Ignored" });

    expect(result).toBe(raw);
  });
});

describe("extractTitle", () => {
  it("should extract the H1 title from content", () => {
    const content = "# My Title\n\nSome body text.";
    const result = extractTitle(content);

    expect(result).toBe("My Title");
  });

  it("should return null when no H1 heading is present", () => {
    const content = "## Subtitle\n\nNo H1 here.";
    const result = extractTitle(content);

    expect(result).toBeNull();
  });

  it("should return the first H1 when multiple H1s exist", () => {
    const content = "# First Title\n\n# Second Title";
    const result = extractTitle(content);

    expect(result).toBe("First Title");
  });
});
