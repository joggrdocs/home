/**
 * Shared utilities for the docs offboarding scripts.
 *
 * No runtime dependencies — Node 20+ built-ins only. The load-bearing
 * piece is `trimJoggrMarkers`; everything else is straightforward
 * filesystem plumbing.
 */

import { access, constants, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

import {
  DOC_EXTENSIONS,
  JOGGR_BLOCK_END_RE,
  JOGGR_BLOCK_START_RE,
  JOGGR_CANDIDATE_SUBSTRINGS,
  JOGGR_CONTENT_DROP_BLOCKS,
  JOGGR_DOCS_BACKUP_DIRNAME,
  JOGGR_FILE_MARKER_RE,
  MANIFEST_FILENAME,
  SKIP_DIRNAMES,
} from './constants.mjs'

/**
 * Read an environment variable, falling back to `defaultValue` if the
 * variable is unset OR set to the empty string.
 */
export function envOr(name, defaultValue) {
  const v = process.env[name]
  return v !== undefined && v !== '' ? v : defaultValue
}

/**
 * Check whether a path exists. Surfaces permission errors instead of
 * swallowing them.
 */
export async function fileExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch (err) {
    if (err?.code === 'ENOENT') return false
    throw err
  }
}

/**
 * SHA-256 hex digest of a file's bytes. Returns null if the file is
 * missing.
 */
export async function sha256File(path) {
  if (!(await fileExists(path))) return null
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Resolve the docs offboarding backup directory. Honors
 * `$JOGGR_DOCS_OFFBOARD_BACKUP_DIR` for tests; otherwise lives at
 * `${HOME}/.joggr-docs-offboard-backup/`. Rejects `/` and `$HOME` to
 * prevent a typo in the env var from causing a catastrophic `rm -rf`.
 */
export function getBackupDir() {
  const raw = envOr('JOGGR_DOCS_OFFBOARD_BACKUP_DIR', join(homedir(), JOGGR_DOCS_BACKUP_DIRNAME))
  const abs = resolve(raw)
  const banned = new Set([sep, homedir()])
  if (banned.has(abs)) {
    throw new Error(
      `Refusing to use ${abs} as the backup directory. ` +
        'Set JOGGR_DOCS_OFFBOARD_BACKUP_DIR to a dedicated path.'
    )
  }
  return abs
}

/** Path to the manifest file inside the backup directory. */
export function getManifestPath() {
  return join(getBackupDir(), MANIFEST_FILENAME)
}

/**
 * Path to the verbatim backup of `absPath` under the backup dir,
 * mirroring its position relative to `scanRoot`. Throws if `absPath` is
 * not inside `scanRoot` (programmer-error guard).
 */
export function getBackupFilePath(absPath, scanRoot) {
  const rel = relative(scanRoot, absPath)
  if (rel.startsWith('..') || rel === '' || rel.includes(`..${sep}`)) {
    throw new Error(`Refusing to back up ${absPath}: not inside scan root ${scanRoot}`)
  }
  return join(getBackupDir(), 'files', rel)
}

/**
 * Expand `~`/`~/` and normalise to an absolute path.
 */
export function resolveScanRoot(raw) {
  if (raw === '~') return homedir()
  if (raw.startsWith('~/')) return resolve(homedir(), raw.slice(2))
  return resolve(raw)
}

/**
 * Walk upward from `startDir` looking for a `.git` entry. Stops at
 * filesystem root or `$HOME`, whichever comes first.
 */
export async function findGitRoot(startDir) {
  const home = homedir()
  let current = resolve(startDir)
  while (true) {
    if (await fileExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return null
    if (current === home) return null
    current = parent
  }
}

/**
 * @typedef {object} GitDirtyReport
 * @property {boolean} isRepo
 * @property {boolean} dirty
 * @property {string[]} lines  - First 20 status lines for display.
 * @property {string | null} error
 */

/**
 * Inspect a directory for uncommitted git changes. Non-throwing —
 * callers decide what to do with the result.
 */
export function inspectGitTree(gitRoot) {
  const inside = spawnSync('git', ['-C', gitRoot, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf-8',
  })
  if (inside.error?.code === 'ENOENT') {
    return { isRepo: false, dirty: false, lines: [], error: 'git not on PATH' }
  }
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return { isRepo: false, dirty: false, lines: [], error: null }
  }

  const result = spawnSync('git', ['-C', gitRoot, 'status', '--porcelain'], { encoding: 'utf-8' })
  if (result.status !== 0) {
    return {
      isRepo: true,
      dirty: false,
      lines: [],
      error: result.stderr?.trim() || `git status exited ${result.status}`,
    }
  }
  const text = (result.stdout ?? '').trimEnd()
  if (text === '') return { isRepo: true, dirty: false, lines: [], error: null }
  return { isRepo: true, dirty: true, lines: text.split('\n').slice(0, 20), error: null }
}

/**
 * Is a file's content even worth parsing for markers? Cheap substring
 * check used by the scanner to skip files quickly.
 */
export function isCandidate(content) {
  for (const s of JOGGR_CANDIDATE_SUBSTRINGS) {
    if (content.includes(s)) return true
  }
  return false
}

/**
 * @typedef {object} ScannedFile
 * @property {string} absPath
 * @property {string} relPath  - Forward-slash path relative to scanRoot.
 */

/**
 * Walk `scanRoot` and return every markdown file with Joggr markers.
 * Skips common build/VCS directories and any absolute paths in
 * `opts.skipPaths`.
 */
export async function findJoggrDocs(scanRoot, opts = {}) {
  /** @type {ScannedFile[]} */
  const out = []
  const skipDirNames = new Set(SKIP_DIRNAMES)
  const skipPaths = opts.skipPaths ?? new Set()

  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (skipPaths.has(full)) continue
      if (entry.isDirectory()) {
        if (skipDirNames.has(entry.name)) continue
        await walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = extname(entry.name).toLowerCase()
      if (!DOC_EXTENSIONS.includes(ext)) continue
      let content
      try {
        content = await readFile(full, 'utf-8')
      } catch {
        continue
      }
      if (!isCandidate(content)) continue
      out.push({
        absPath: full,
        relPath: relative(scanRoot, full).split(sep).join('/'),
      })
    }
  }

  await walk(scanRoot)
  out.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return out
}

/**
 * @typedef {object} TrimStats
 * @property {number} fileMarker
 * @property {number} version
 * @property {number} blocksContentDropped
 * @property {number} blocksMarkersOnly
 * @property {boolean} unbalanced
 */

/**
 * @typedef {object} TrimResult
 * @property {string} content
 * @property {boolean} changed
 * @property {TrimStats} stats
 */

/**
 * Remove Joggr-managed markers from a markdown document.
 *
 * Modelled on `@joggrdocs/bashir`'s `stripAll`. Two strategies per
 * block name:
 *
 *   - `JOGGR_CONTENT_DROP_BLOCKS` (`warning`, `editLink`) — drop both
 *     markers AND every line between them. The content is Joggr-authored
 *     boilerplate with no value after offboarding.
 *
 *   - Everything else (`snippet`, `createSnippet`, `autoTarget`,
 *     `codeLink`, `createCodeLink`, plus any future block) — drop ONLY
 *     the markers, KEEP the content. That content is the user's code,
 *     links, or prose; deleting it would corrupt their docs.
 *
 * Safety rails:
 *   - Code-fence aware (``` and `~~~`).
 *   - Stack-balanced by `(name, params)`.
 *   - Unmatched `:start` at EOF aborts: returns original content with
 *     `unbalanced: true` and `changed: false`. Callers should surface
 *     the file for manual review.
 *   - Preserves the dominant line ending.
 */
export function trimJoggrMarkers(content) {
  const eol = detectEol(content)
  const lines = content.split(/\r\n|\r|\n/)

  /** @type {string[]} */
  const out = []
  /** @type {Array<{ name: string, params: string, dropContent: boolean }>} */
  const stack = []
  let inFence = false
  let fenceChar = ''
  const stats = {
    fileMarker: 0,
    version: 0,
    blocksContentDropped: 0,
    blocksMarkersOnly: 0,
    unbalanced: false,
  }
  const fenceRe = /^(\s{0,3})(```+|~~~+)/

  for (const line of lines) {
    const fenceMatch = line.match(fenceRe)
    if (fenceMatch) {
      const ch = fenceMatch[2][0]
      if (!inFence) {
        inFence = true
        fenceChar = ch
      } else if (ch === fenceChar) {
        inFence = false
        fenceChar = ''
      }
      out.push(line)
      continue
    }

    if (inFence) {
      out.push(line)
      continue
    }

    if (stack.length > 0) {
      const top = stack[stack.length - 1]
      const endM = line.match(JOGGR_BLOCK_END_RE)
      if (endM && endM[1] === top.name && (endM[2] ?? '') === top.params) {
        stack.pop()
        if (top.dropContent) stats.blocksContentDropped += 1
        else stats.blocksMarkersOnly += 1
        continue
      }
      if (!top.dropContent) out.push(line)
      continue
    }

    if (JOGGR_FILE_MARKER_RE.test(line)) {
      stats.fileMarker += 1
      continue
    }

    const startM = line.match(JOGGR_BLOCK_START_RE)
    if (startM) {
      stack.push({
        name: startM[1],
        params: startM[2] ?? '',
        dropContent: JOGGR_CONTENT_DROP_BLOCKS.has(startM[1]),
      })
      continue
    }

    const endOnlyM = line.match(JOGGR_BLOCK_END_RE)
    if (endOnlyM) {
      stats.version += 1
      continue
    }

    out.push(line)
  }

  if (stack.length > 0) {
    return { content, changed: false, stats: { ...stats, unbalanced: true } }
  }

  const collapsed = collapseBlankLines(out)
  const trimmed = trimLeadingBlankLines(collapsed)
  const next = trimmed.join(eol)
  const changed = next !== content
  return { content: next, changed, stats }
}

/** @private */
function detectEol(content) {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      if (i > 0 && content.charCodeAt(i - 1) === 13) crlf += 1
      else lf += 1
    }
  }
  return crlf > lf ? '\r\n' : '\n'
}

/** @private */
function collapseBlankLines(lines) {
  const out = []
  let blanks = 0
  for (const line of lines) {
    if (line.trim() === '') {
      blanks += 1
      if (blanks > 1) continue
    } else {
      blanks = 0
    }
    out.push(line)
  }
  return out
}

/** @private */
function trimLeadingBlankLines(lines) {
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i += 1
  return lines.slice(i)
}

/**
 * @typedef {object} ManifestEntry
 * @property {string} absPath
 * @property {string} relPath
 * @property {string} originalSha256
 */

/**
 * @typedef {object} Manifest
 * @property {string} scanRoot
 * @property {ManifestEntry[]} files
 */

/**
 * Read the manifest from the backup directory. Returns null if missing,
 * throws on parse errors.
 */
export async function readManifest() {
  const path = getManifestPath()
  if (!(await fileExists(path))) return null
  const raw = await readFile(path, 'utf-8')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Manifest at ${path} is not valid JSON: ${err.message}`)
  }
  if (!Array.isArray(parsed?.files) || typeof parsed.scanRoot !== 'string') {
    throw new Error(`Manifest at ${path} is malformed.`)
  }
  return parsed
}

/**
 * Persist the manifest. Pretty-printed JSON with a trailing newline.
 */
export async function writeManifest(manifest) {
  const path = getManifestPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}
