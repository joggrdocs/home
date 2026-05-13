/**
 * Unit tests for `lib/utils.mjs`. Happy-path coverage only.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  fileExists,
  findJoggrEntries,
  findJoggrHooks,
  hasBinary,
  isJoggrCommand,
  withoutJoggrHooks,
} from '../utils.mjs'

describe('fileExists', () => {
  let dir
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'offboard-test-'))
    await writeFile(join(dir, 'present.txt'), 'hi')
  })
  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('true for present, false for missing', async () => {
    assert.equal(await fileExists(join(dir, 'present.txt')), true)
    assert.equal(await fileExists(join(dir, 'missing.txt')), false)
  })
})

describe('hasBinary', () => {
  it('true for sh, false for a clearly-missing binary', () => {
    assert.equal(hasBinary('sh'), true)
    assert.equal(hasBinary('definitely-not-a-real-binary-jdfhsdfhsdjf'), false)
  })
})

describe('isJoggrCommand', () => {
  it('matches jog, joggr, and absolute-path variants', () => {
    assert.equal(isJoggrCommand('jog app --plan'), true)
    assert.equal(isJoggrCommand('joggr app --plan'), true)
    assert.equal(isJoggrCommand('/opt/homebrew/bin/jog app --plan'), true)
    assert.equal(isJoggrCommand('  jog app --plan'), true)
  })

  it('rejects non-Joggr commands', () => {
    assert.equal(isJoggrCommand('notify.sh'), false)
    assert.equal(isJoggrCommand('echo hi'), false)
    assert.equal(isJoggrCommand(''), false)
    assert.equal(isJoggrCommand(null), false)
  })
})

describe('findJoggrHooks', () => {
  const joggrHook = { type: 'command', command: 'jog app --plan' }
  const userHook = { type: 'command', command: 'notify.sh' }

  it('returns the matching entries, ignoring others', () => {
    const settings = {
      hooks: {
        PermissionRequest: [
          { matcher: '*', hooks: [userHook] },
          { matcher: 'ExitPlanMode', hooks: [joggrHook] },
          { matcher: 'ExitPlanMode', hooks: [userHook] },
        ],
      },
    }
    const result = findJoggrHooks(settings)
    assert.equal(result.length, 1)
    assert.equal(result[0].hooks[0].command, 'jog app --plan')
  })

  it('returns [] for empty / null / missing structures', () => {
    assert.deepEqual(findJoggrHooks(null), [])
    assert.deepEqual(findJoggrHooks({}), [])
    assert.deepEqual(findJoggrHooks({ hooks: { PermissionRequest: [] } }), [])
  })
})

describe('withoutJoggrHooks', () => {
  it('drops the Joggr command but keeps non-Joggr siblings under the same entry', () => {
    const settings = {
      hooks: {
        PermissionRequest: [
          {
            matcher: 'ExitPlanMode',
            hooks: [
              { type: 'command', command: 'jog app --plan' },
              { type: 'command', command: 'echo personal' },
            ],
          },
        ],
      },
    }
    const { entries, removed } = withoutJoggrHooks(settings)
    assert.equal(removed, 1)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].hooks.length, 1)
    assert.equal(entries[0].hooks[0].command, 'echo personal')
  })

  it('drops an ExitPlanMode entry whose only hooks were Joggr', () => {
    const settings = {
      hooks: {
        PermissionRequest: [
          { matcher: '*', hooks: [{ type: 'command', command: 'notify.sh' }] },
          { matcher: 'ExitPlanMode', hooks: [{ type: 'command', command: 'jog app --plan' }] },
        ],
      },
    }
    const { entries, removed } = withoutJoggrHooks(settings)
    assert.equal(removed, 1)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].matcher, '*')
  })

  it('returns counts of 0 when no Joggr hooks are present', () => {
    const settings = {
      hooks: { PermissionRequest: [{ matcher: '*', hooks: [{ type: 'command', command: 'notify.sh' }] }] },
    }
    const { removed } = withoutJoggrHooks(settings)
    assert.equal(removed, 0)
  })
})

describe('findJoggrEntries', () => {
  let dir
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'offboard-entries-'))
    await mkdir(join(dir, 'gg-plan'))
    await mkdir(join(dir, 'gg-review'))
    await mkdir(join(dir, 'user-skill'))
  })
  after(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns only entries with the gg- prefix', async () => {
    const entries = await findJoggrEntries(dir)
    assert.deepEqual(entries.sort(), ['gg-plan', 'gg-review'])
  })

  it('returns [] when the directory does not exist', async () => {
    assert.deepEqual(await findJoggrEntries(join(dir, 'nope')), [])
  })
})
