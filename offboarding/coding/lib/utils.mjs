/**
 * Shared helpers for the offboarding scripts. Node 20+, no runtime deps.
 */

import { access, constants, readdir, rename } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import {
  JOGGR_BACKUP_DIRNAME,
  JOGGR_BINARY_NAMES,
  JOGGR_HOOK_MATCHER,
  JOGGR_NAME_PREFIX,
} from './constants.mjs'

/** True if `path` exists and is accessible (any error → false). */
export async function fileExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** True if `bin` is on PATH. */
export function hasBinary(bin) {
  return spawnSync('sh', ['-c', 'command -v "$1"', '_', bin], { stdio: 'ignore' }).status === 0
}

/** Move `src` to `dst` via `rename`. Throws on any error — happy path only. */
export async function moveFile(src, dst) {
  await rename(src, dst)
}

/** True if a hook command string invokes `jog` / `joggr` (basename match). */
export function isJoggrCommand(command) {
  if (typeof command !== 'string') return false
  const firstToken = command.trim().split(/\s+/)[0]
  if (!firstToken) return false
  return JOGGR_BINARY_NAMES.includes(basename(firstToken))
}

/** Return Joggr-matching entries from `settings.hooks.PermissionRequest`. */
export function findJoggrHooks(settings) {
  const entries = settings?.hooks?.PermissionRequest ?? []
  if (!Array.isArray(entries)) return []
  return entries.filter(
    (e) => e?.matcher === JOGGR_HOOK_MATCHER && Array.isArray(e?.hooks) && e.hooks.some((h) => isJoggrCommand(h?.command))
  )
}

/**
 * Surgically remove Joggr hook commands from `PermissionRequest`,
 * preserving non-Joggr siblings. Drops an entry whose `hooks` empties.
 */
export function withoutJoggrHooks(settings) {
  const entries = settings?.hooks?.PermissionRequest ?? []
  if (!Array.isArray(entries)) return { entries: [], removed: 0 }
  let removed = 0
  const result = []
  for (const entry of entries) {
    if (entry?.matcher !== JOGGR_HOOK_MATCHER) {
      result.push(entry)
      continue
    }
    const hooks = Array.isArray(entry?.hooks) ? entry.hooks : []
    const kept = hooks.filter((h) => !isJoggrCommand(h?.command))
    const dropped = hooks.length - kept.length
    if (dropped === 0) {
      result.push(entry)
      continue
    }
    removed += dropped
    if (kept.length > 0) result.push({ ...entry, hooks: kept })
  }
  return { entries: result, removed }
}

/** `gg-*` entries inside a Claude subdir (`skills` / `agents`). [] on ENOENT. */
export async function findJoggrEntries(dir) {
  try {
    const entries = await readdir(dir)
    return entries.filter((name) => name.startsWith(JOGGR_NAME_PREFIX))
  } catch (err) {
    if (err?.code === 'ENOENT') return []
    throw err
  }
}

export function getClaudeHomeDir() {
  return process.env.CLAUDE_HOME || join(homedir(), '.claude')
}

export function getClaudeSettingsPath() {
  return join(getClaudeHomeDir(), 'settings.json')
}

export function getBackupDir() {
  return process.env.JOGGR_OFFBOARD_BACKUP_DIR || join(homedir(), JOGGR_BACKUP_DIRNAME)
}

export function getBackupSettingsPath() {
  return join(getBackupDir(), 'settings.json')
}

export function getPostOffboardSettingsPath() {
  return join(getBackupDir(), 'settings.post-offboard.json')
}

export function getBackupSubdir(subdir) {
  return join(getBackupDir(), subdir)
}
