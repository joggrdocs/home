#!/usr/bin/env node
/**
 * Joggr docs offboarding — happy path only.
 *
 * Walks a scan root (the enclosing `.git` repo by default), finds every
 * markdown file with Joggr markers, backs each one up, then rewrites
 * the file with the markers removed.
 *
 * If anything looks off — dirty git tree, existing backup directory,
 * unmatched markers, hash mismatch, read/write error — the script
 * fails and tells you to use the manual steps in README.md. There is
 * no recovery, no resume, no override flags. Sorry.
 *
 * Usage:
 *   node offboard.mjs                  # scan the enclosing git repo
 *   node offboard.mjs --scan <path>    # scan an explicit path
 *   node offboard.mjs --dry-run        # preview only, no disk writes
 *   node offboard.mjs --yes            # auto-confirm the proceed prompt
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'

import {
  fileExists,
  findGitRoot,
  findJoggrDocs,
  getBackupDir,
  getBackupFilePath,
  inspectGitTree,
  resolveScanRoot,
  sha256File,
  trimJoggrMarkers,
  writeManifest,
} from './lib/utils.mjs'

const args = process.argv.slice(2)
const scanIdx = args.indexOf('--scan')
const SCAN_ROOT_RAW = scanIdx >= 0 ? args[scanIdx + 1] : null
const DRY_RUN = args.includes('--dry-run')
const AUTO_YES = args.includes('--yes') || args.includes('-y')

if (scanIdx >= 0 && (!SCAN_ROOT_RAW || SCAN_ROOT_RAW.startsWith('--'))) {
  console.error('Error: --scan requires a path argument')
  process.exit(2)
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const rl = createInterface({ input: process.stdin, output: process.stdout })

const exitCode = await main()
rl.close()
process.exit(exitCode)

async function main() {
  console.log('Joggr docs offboarding')
  console.log('----------------------')
  if (DRY_RUN) console.log('(dry-run: nothing will be written)')
  console.log()

  const scanRoot = SCAN_ROOT_RAW
    ? resolveScanRoot(SCAN_ROOT_RAW)
    : await findGitRoot(SCRIPT_DIR)
  if (!scanRoot) {
    return giveUp(
      'Could not determine a scan root.',
      'Pass --scan <path> to point at your docs repo.'
    )
  }
  if (!(await fileExists(scanRoot))) {
    return giveUp(`Scan root does not exist: ${scanRoot}`)
  }
  console.log(`Scan root: ${scanRoot}`)
  console.log()

  // Exclude the tool's own directory from the dirty check — install.sh
  // drops it inside the user's repo as an untracked artifact.
  const git = inspectGitTree(scanRoot, { skipPaths: new Set([SCRIPT_DIR]) })
  if (git.isRepo && git.error) {
    return giveUp(`git status failed at ${scanRoot}: ${git.error}`)
  }
  if (git.isRepo && git.dirty) {
    console.error('Uncommitted changes:')
    for (const line of git.lines) console.error(`  ${line}`)
    if (git.lines.length >= 20) console.error('  ...')
    return giveUp(
      'Scan root has uncommitted changes.',
      'Commit or stash everything first (including untracked files like this tool directory).'
    )
  }

  const backupDir = getBackupDir()
  if (await fileExists(backupDir)) {
    return giveUp(
      `A backup directory already exists at ${backupDir}.`,
      `Run \`node restore.mjs\` to undo a previous run, or delete it manually: rm -rf ${backupDir}`
    )
  }

  console.log(`Scanning ${scanRoot}...`)
  const files = await findJoggrDocs(scanRoot, { skipPaths: new Set([SCRIPT_DIR]) })
  console.log(`Found ${files.length} file${files.length === 1 ? '' : 's'} with Joggr markers.`)
  if (files.length === 0) {
    console.log('Nothing to do.')
    return 0
  }
  for (const f of files) console.log(`  - ${f.relPath}`)
  console.log()

  const ok = await confirm(`Proceed? Each file is backed up under ${backupDir}/files/ before being rewritten.`)
  if (!ok) return 0

  const manifest = { scanRoot, files: [] }

  for (const file of files) {
    console.log(`• ${file.relPath}`)

    let content
    try {
      content = await readFile(file.absPath, 'utf-8')
    } catch (err) {
      return giveUp(`Could not read ${file.relPath}: ${err.message}`)
    }

    const result = trimJoggrMarkers(content)

    if (result.stats.unbalanced) {
      return giveUp(
        `${file.relPath} has unmatched @joggr block markers.`,
        'Handle this file by hand before re-running.'
      )
    }
    if (!result.changed) {
      console.log('    (no markers — skipping)')
      continue
    }

    const backupPath = getBackupFilePath(file.absPath, scanRoot)
    const originalHash = sha256(content)

    if (DRY_RUN) {
      console.log(`    DRY-RUN: would back up to ${backupPath} and rewrite in place`)
      continue
    }

    try {
      await mkdir(dirname(backupPath), { recursive: true })
      await copyFile(file.absPath, backupPath)
    } catch (err) {
      return giveUp(`Could not back up ${file.relPath}: ${err.message}`)
    }

    const backupHash = await sha256File(backupPath)
    if (backupHash !== originalHash) {
      return giveUp(
        `Backup verification failed for ${file.relPath} (hash mismatch).`,
        `Original is untouched. The bad backup is at ${backupPath}.`
      )
    }

    try {
      await writeFile(file.absPath, result.content, 'utf-8')
    } catch (err) {
      return giveUp(`Could not rewrite ${file.relPath}: ${err.message}`)
    }

    manifest.files.push({
      absPath: file.absPath,
      relPath: file.relPath,
      originalSha256: originalHash,
    })
    console.log(`    Stripped. Backup at ${backupPath}`)
  }

  if (!DRY_RUN && manifest.files.length > 0) {
    await writeManifest(manifest)
  }

  console.log()
  console.log('Done.')
  if (!DRY_RUN) {
    console.log(`Backup dir: ${backupDir}`)
    console.log('To undo:    node restore.mjs')
  }
  console.log()
  console.log('The GitHub App is NOT touched by this script — see README.md → "Uninstall the GitHub App".')
  return 0
}

function giveUp(reason, hint) {
  console.error()
  console.error('Sorry — falling back to manual mode.')
  console.error()
  console.error(`  ${reason}`)
  if (hint) console.error(`  ${hint}`)
  console.error()
  console.error('See README.md → "Manual steps".')
  return 1
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function confirm(question) {
  if (AUTO_YES) {
    console.log(`${question} (y/N) [auto-yes]`)
    return true
  }
  const answer = await rl.question(`${question} (y/N) `)
  return /^y(es)?$/i.test(answer.trim())
}
