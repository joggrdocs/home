/**
 * Shared frontmatter parsing and manipulation utilities for markdown files.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regex for matching YAML frontmatter delimited by `---`.
 */
export const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Parses YAML frontmatter from a raw markdown string.
 *
 * Returns the parsed frontmatter as `T` and the remaining content (without
 * leading newlines), or `null` when no frontmatter block is found.
 *
 * @param raw - Full markdown string including the `---` delimiters
 * @returns Parsed frontmatter and body content, or `null`
 */
export function parseFrontmatter<T extends object>(
  raw: string,
): { readonly frontmatter: T; readonly content: string } | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const frontmatter = parseYaml(match[1]) as T;
  const content = raw.slice(match[0].length).replace(/^\n+/, "");

  return { frontmatter, content };
}

/**
 * Replaces or merges fields in the YAML frontmatter of a markdown string.
 *
 * If the string has no frontmatter block the original string is returned
 * unchanged.
 *
 * @param raw - Full markdown string including the `---` delimiters
 * @param updates - Partial frontmatter fields to merge
 * @returns Updated markdown string
 */
export function updateFrontmatter<T extends object>(raw: string, updates: Partial<T>): string {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return raw;
  }

  const frontmatter = { ...(parseYaml(match[1]) as T), ...updates };
  const rest = raw.slice(match[0].length);

  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---${rest}`;
}

/**
 * Extracts the first H1 title (`# ...`) from markdown content.
 *
 * @param content - Markdown content (without frontmatter)
 * @returns The title text, or `null` when no H1 heading is found
 */
export function extractTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  if (!match) {
    return null;
  }
  return match[1].trim();
}
