#!/usr/bin/env node
/**
 * Joggr docs offboarding — restore.
 *
 * Reads the manifest at `~/.joggr-docs-offboard-backup/manifest.json`
 * and copies each backed-up file back to its original location. Each
 * backup's SHA-256 is verified against the manifest before overwrite.
 *
 * If anything looks off (manifest unreadable, backup missing, hash
 * mismatch, write error) the script fails and tells you to recover by
 * hand from the backup dir. No drift detection, no partial restores.
 *
 * Usage:
 *   node restore.mjs            # interactive
 *   node restore.mjs --dry-run  # preview only
 *   node restore.mjs --yes      # auto-confirm
 */

import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'

import {
  fileExists,
  getBackupDir,
  getBackupFilePath,
  readManifest,
  sha256File,
} from './lib/utils.mjs'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const AUTO_YES = args.includes('--yes') || args.includes('-y')

const rl = createInterface({ input: process.stdin, output: process.stdout })

const exitCode = await main()
rl.close()
process.exit(exitCode)

async function main() {
  console.log('Joggr docs offboarding — restore')
  console.log('--------------------------------')
  if (DRY_RUN) console.log('(dry-run: nothing will be written)')
  console.log()

  const backupDir = getBackupDir()
  if (!(await fileExists(backupDir))) {
    console.log(`No backup directory at ${backupDir}.`)
    console.log('Nothing to restore.')
    return 0
  }

  let manifest
  try {
    manifest = await readManifest()
  } catch (err) {
    return giveUp(`Manifest at ${backupDir}/manifest.json is unreadable: ${err.message}`)
  }
  if (!manifest || manifest.files.length === 0) {
    console.log('Manifest is empty — nothing to restore.')
    return 0
  }

  console.log(`${manifest.files.length} file${manifest.files.length === 1 ? '' : 's'} to restore:`)
  for (const f of manifest.files) console.log(`  - ${f.relPath}`)
  console.log()

  const ok = await confirm(`Restore from ${backupDir}?`)
  if (!ok) return 0

  for (const entry of manifest.files) {
    console.log(`• ${entry.relPath}`)
    const backupPath = getBackupFilePath(entry.absPath, manifest.scanRoot)

    if (!(await fileExists(backupPath))) {
      return giveUp(`Backup file missing for ${entry.relPath} at ${backupPath}.`)
    }
    const backupHash = await sha256File(backupPath)
    if (backupHash !== entry.originalSha256) {
      return giveUp(
        `Backup for ${entry.relPath} does not match the recorded hash.`,
        `Recover by hand from ${backupPath}.`
      )
    }

    if (DRY_RUN) {
      console.log(`    DRY-RUN: would copy ${backupPath} → ${entry.absPath}`)
      continue
    }

    try {
      await mkdir(dirname(entry.absPath), { recursive: true })
      await copyFile(backupPath, entry.absPath)
    } catch (err) {
      return giveUp(`Could not restore ${entry.relPath}: ${err.message}`)
    }
    console.log('    Restored.')
  }

  if (!DRY_RUN) {
    console.log()
    if (await confirm(`Delete ${backupDir}?`)) {
      await rm(backupDir, { recursive: true, force: true })
      console.log(`Removed ${backupDir}.`)
    }
  }

  console.log()
  console.log('Done.')
  console.log()
  console.log('The GitHub App is NOT affected by restore — see README.md to reinstall.')
  return 0
}

function giveUp(reason, hint) {
  console.error()
  console.error('Sorry — restore could not complete.')
  console.error()
  console.error(`  ${reason}`)
  if (hint) console.error(`  ${hint}`)
  console.error()
  console.error(`Your backups are still at ${getBackupDir()}/files/ — recover from there by hand.`)
  return 1
}

async function confirm(question) {
  if (AUTO_YES) {
    console.log(`${question} (y/N) [auto-yes]`)
    return true
  }
  const answer = await rl.question(`${question} (y/N) `)
  return /^y(es)?$/i.test(answer.trim())
}
