#!/usr/bin/env node
/**
 * Joggr offboarding — restore.
 *
 * Puts back `~/.claude/settings.json` and the `gg-*` skills/agents from
 * `~/.joggr-offboard-backup/`, then removes the backup directory.
 *
 * Happy path only. If `~/.claude/settings.json` has been edited since
 * offboarding (SHA mismatch with our post-offboard snapshot), or any
 * gg-* target already exists, the script fails loud and points at the
 * README for manual recovery.
 *
 * The CLI is NOT auto-restored — reinstall it manually with npm/pnpm/bun.
 *
 * Usage:
 *   node restore.mjs            # interactive
 *   node restore.mjs --yes      # auto-confirm
 *
 * Requires Node 20+.
 */

import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import {
  fileExists,
  getBackupDir,
  getBackupSettingsPath,
  getBackupSubdir,
  getClaudeHomeDir,
  getClaudeSettingsPath,
  getPostOffboardSettingsPath,
  moveFile,
} from './lib/utils.mjs'

const AUTO_YES = process.argv.includes('--yes') || process.argv.includes('-y')

const rl = createInterface({ input: process.stdin, output: process.stdout })

try {
  console.log('Joggr offboarding — restore')
  console.log('---------------------------\n')

  const backupDir = getBackupDir()
  if (!(await fileExists(backupDir))) {
    console.log(`No backup directory at ${backupDir}. Nothing to restore.`)
    rl.close()
    process.exit(0)
  }

  await restoreSettings()
  await restoreGgEntries('skills')
  await restoreGgEntries('agents')

  console.log(`\nRemoving backup directory ${backupDir}`)
  await rm(backupDir, { recursive: true, force: true })

  console.log('\nDone.\n\nThe CLI was not reinstalled. Reinstall manually:')
  console.log('  npm install -g @joggr/cli  /  pnpm add -g @joggr/cli  /  bun add -g @joggr/cli')
  rl.close()
  process.exit(0)
} catch (err) {
  bail(`Restore failed: ${err.message}`)
}

async function restoreSettings() {
  console.log('Step 1 — Restore Claude Code settings')
  const backupPath = getBackupSettingsPath()
  if (!(await fileExists(backupPath))) {
    console.log(`  No ${backupPath} — skipping.`)
    return
  }
  const targetPath = getClaudeSettingsPath()
  if (await fileExists(targetPath)) {
    const markerPath = getPostOffboardSettingsPath()
    const liveBytes = await readFile(targetPath)
    const markerBytes = (await fileExists(markerPath)) ? await readFile(markerPath) : null
    if (markerBytes === null || !liveBytes.equals(markerBytes)) {
      throw new Error(
        `${targetPath} has been edited since offboarding. Restore would overwrite your edits. ` +
          'See the manual restore steps in README.md.'
      )
    }
  }
  if (!(await confirm(`  Overwrite ${targetPath} with ${backupPath}?`))) return
  await mkdir(dirname(targetPath), { recursive: true })
  await copyFile(backupPath, targetPath)
  console.log('  Restored.')
}

async function restoreGgEntries(subdir) {
  console.log(`\nStep ${subdir === 'skills' ? '2' : '3'} — Restore ${subdir}`)
  const backupSubdir = getBackupSubdir(subdir)
  let entries
  try {
    entries = await readdir(backupSubdir)
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.log(`  No backup of ${subdir} — skipping.`)
      return
    }
    throw err
  }
  if (entries.length === 0) return

  const targetDir = join(getClaudeHomeDir(), subdir)
  for (const name of entries) {
    if (await fileExists(join(targetDir, name))) {
      throw new Error(
        `${join(targetDir, name)} already exists. Move it aside and re-run, or restore manually.`
      )
    }
  }

  console.log(`  Found ${entries.length}: ${entries.join(', ')}`)
  if (!(await confirm(`  Restore to ${targetDir}?`))) return
  await mkdir(targetDir, { recursive: true })
  for (const name of entries) await moveFile(join(backupSubdir, name), join(targetDir, name))
  console.log('  Restored.')
}

async function confirm(question) {
  if (AUTO_YES) {
    console.log(`${question} (y/N) [auto-yes]`)
    return true
  }
  try {
    const answer = await rl.question(`${question} (y/N) `)
    return /^y(es)?$/i.test(answer.trim())
  } catch (err) {
    if (err?.code === 'ERR_USE_AFTER_CLOSE') return false
    throw err
  }
}

function bail(...lines) {
  console.error()
  for (const line of lines) console.error(line)
  console.error('\nIf you want to recover manually, see the README for step-by-step instructions.')
  rl.close()
  process.exit(1)
}
