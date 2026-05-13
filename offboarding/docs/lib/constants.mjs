/**
 * Constants shared across the docs offboarding scripts.
 *
 * Anything that's a literal value (regex, dirname, file pattern) lives
 * here. Pure functions and filesystem helpers live in `./utils.mjs`.
 */

/**
 * File marker injected at the very top of a Joggr-managed document.
 * Single-line, no content. Identifies the file as Joggr-managed.
 */
export const JOGGR_FILE_MARKER_RE = /^<!--\s*@@joggrdoc@@\s*-->\s*$/

/**
 * Block start marker: `<!-- @joggr:NAME(PARAMS)?:start -->`
 *
 * Captures:
 *   1. NAME        — e.g. `warning`, `editLink`, `version`
 *   2. PARAMS      — optional `(...)` payload, e.g. a UUID or version tag
 */
export const JOGGR_BLOCK_START_RE =
  /^<!--\s*@joggr:([a-zA-Z][a-zA-Z0-9_-]*)(?:\(([^)]*)\))?:start\s*-->\s*$/

/**
 * Block end marker: `<!-- @joggr:NAME(PARAMS)?:end -->`. Same shape as
 * the start marker. Pair by `(NAME, PARAMS)` so `editLink(uuid-A)` does
 * not match `editLink(uuid-B)`.
 */
export const JOGGR_BLOCK_END_RE =
  /^<!--\s*@joggr:([a-zA-Z][a-zA-Z0-9_-]*)(?:\(([^)]*)\))?:end\s*-->\s*$/

/**
 * Fast first-pass check used by the file scanner. A file is a candidate
 * for stripping only if it contains at least one of these substrings.
 */
export const JOGGR_CANDIDATE_SUBSTRINGS = Object.freeze([
  '<!--@@joggrdoc@@-->',
  '@joggr:',
])

/**
 * Block names whose CONTENT was authored by Joggr (not the user) and
 * is safe to drop alongside the markers. Everything else falls into the
 * default `markers-only` strategy — we strip the wrapping `:start` and
 * `:end` comments but preserve every line in between, which is almost
 * always the user's code, links, or prose.
 *
 * DO NOT add `snippet`, `createSnippet`, `autoTarget`, `codeLink`, or
 * `createCodeLink` here — those wrap real user content.
 */
export const JOGGR_CONTENT_DROP_BLOCKS = Object.freeze(
  new Set(['warning', 'editLink'])
)

/** Extensions we'll consider when walking a scan root. */
export const DOC_EXTENSIONS = Object.freeze(['.md', '.mdx'])

/** Directory names skipped when walking. */
export const SKIP_DIRNAMES = Object.freeze([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
])

/**
 * Directory name used for the docs offboarding backup. Lives at
 * `${HOME}/${JOGGR_DOCS_BACKUP_DIRNAME}/` by default.
 */
export const JOGGR_DOCS_BACKUP_DIRNAME = '.joggr-docs-offboard-backup'

/** Filename of the manifest inside the backup dir. */
export const MANIFEST_FILENAME = 'manifest.json'
