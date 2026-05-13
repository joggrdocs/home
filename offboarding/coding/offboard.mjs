#!/usr/bin/env node
/**
 * Joggr offboarding — uninstall the CLI, surgically remove the Claude
 * Code hook (preserving non-Joggr siblings), quarantine gg-* skills
 * and agents to ~/.joggr-offboard-backup/. Reversible via `restore.mjs`.
 *
 * Happy path only. On any unexpected failure (unreadable settings, mid-
 * run error) the script fails loud and points at the manual steps in
 * README.md.
 *
 * Usage:
 *   node offboard.mjs           # interactive
 *   node offboard.mjs --yes     # auto-confirm every prompt
 *
 * Requires Node 20+.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { PACKAGE_MANAGERS } from './lib/constants.mjs'
import {
  fileExists,
  findJoggrEntries,
  getBackupDir,
  getBackupSettingsPath,
  getBackupSubdir,
  getClaudeHomeDir,
  getClaudeSettingsPath,
  getPostOffboardSettingsPath,
  hasBinary,
  moveFile,
  withoutJoggrHooks,
} from './lib/utils.mjs'

const AUTO_YES = process.argv.includes('--yes') || process.argv.includes('-y')
const SKIP_UNINSTALL = !!process.env.JOGGR_OFFBOARD_SKIP_UNINSTALL

const rl = createInterface({ input: process.stdin, output: process.stdout })

try {
  console.log('Joggr offboarding')
  console.log('-----------------\n')

  const backupDir = getBackupDir()
  if (await fileExists(backupDir)) {
    bail(
      `A previous offboarding backup exists at ${backupDir}.`,
      'Run `node restore.mjs` first, or delete the backup manually:',
      `  rm -rf ${backupDir}`
    )
  }

  await uninstallCli()
  await removeClaudeHook()
  await quarantineGgEntries()

  console.log(`\nDone.\n\nBackup: ${backupDir}\nRun \`node restore.mjs\` to undo, or \`node status.mjs\` to verify.`)
  rl.close()
  process.exit(0)
} catch (err) {
  bail(`Offboarding failed: ${err.message}`)
}

async function uninstallCli() {
  console.log('Step 1 — Uninstall @joggr/cli')
  if (SKIP_UNINSTALL) return

  const available = PACKAGE_MANAGERS.filter((m) => hasBinary(m.cmd))
  if (available.length === 0) {
    console.log('  No npm/pnpm/bun on PATH — skipping.')
    return
  }
  for (const manager of available) {
    if (await confirm(`  Uninstall @joggr/cli with ${manager.name}?`)) {
      spawnSync(manager.cmd, manager.uninstallArgs, { stdio: 'inherit' })
    }
  }
  const stillOnPath = ['jog', 'joggr'].filter((bin) => hasBinary(bin))
  if (stillOnPath.length > 0) {
    console.log(`  Note: ${stillOnPath.join(' / ')} still on PATH. If installed via brew/volta/asdf, uninstall with that tool.`)
  }
}

async function removeClaudeHook() {
  console.log('\nStep 2 — Remove Joggr hook from Claude Code settings')
  const settingsPath = getClaudeSettingsPath()
  let settings
  try {
    settings = JSON.parse(await readFile(settingsPath, 'utf-8'))
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.log(`  No ${settingsPath} — skipping.`)
      return
    }
    throw new Error(`could not read or parse ${settingsPath}: ${err.message}`)
  }

  const { entries, removed } = withoutJoggrHooks(settings)
  if (removed === 0) {
    console.log('  No Joggr hook found — skipping.')
    return
  }

  const backupPath = getBackupSettingsPath()
  console.log(`  Found ${removed} Joggr hook command(s). Original will be backed up to ${backupPath}.`)
  if (!(await confirm('  Proceed?'))) return

  await mkdir(dirname(backupPath), { recursive: true })
  await copyFile(settingsPath, backupPath)

  const next = { ...settings, hooks: { ...settings.hooks } }
  if (entries.length > 0) next.hooks.PermissionRequest = entries
  else delete next.hooks.PermissionRequest
  if (Object.keys(next.hooks).length === 0) delete next.hooks

  const newRaw = `${JSON.stringify(next, null, 2)}\n`
  await writeFile(settingsPath, newRaw, 'utf-8')
  await writeFile(getPostOffboardSettingsPath(), newRaw, 'utf-8')
  console.log('  Removed.')
}

async function quarantineGgEntries() {
  console.log('\nStep 3 — Quarantine gg-* skills and agents')
  const claudeDir = getClaudeHomeDir()
  for (const sub of ['skills', 'agents']) {
    const srcDir = join(claudeDir, sub)
    const entries = await findJoggrEntries(srcDir)
    if (entries.length === 0) {
      console.log(`  No gg-* in ${srcDir} — skipping.`)
      continue
    }
    const dstDir = getBackupSubdir(sub)
    console.log(`  Found ${entries.length} entries in ${srcDir}: ${entries.join(', ')}`)
    if (!(await confirm(`  Move to ${dstDir}?`))) continue
    await mkdir(dstDir, { recursive: true })
    for (const name of entries) await moveFile(join(srcDir, name), join(dstDir, name))
  }
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
  console.error('\nIf you want to clean up manually, see the README for step-by-step instructions.')
  rl.close()
  process.exit(1)
}
