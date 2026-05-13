/**
 * Unit tests for the docs offboarding trimmer and scanner.
 *
 * Run with `node --test lib/__tests__/utils.test.mjs`.
 *
 * The trimmer is the load-bearing piece — if it misclassifies a marker
 * we'll delete user code. These tests pin the behavior against the
 * upstream `@joggrdocs/bashir` `stripAll` snapshot from `stargate`, so a
 * regression here would show up immediately.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findJoggrDocs, isCandidate, trimJoggrMarkers } from '../utils.mjs'

/** @type {string[]} */
const tmpDirsToCleanUp = []

async function trackedTmp(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tmpDirsToCleanUp.push(dir)
  return dir
}

test.after(async () => {
  for (const path of tmpDirsToCleanUp) {
    await rm(path, { recursive: true, force: true }).catch(() => {})
  }
})

const REAL_JOGGR_DOC = [
  '<!--@@joggrdoc@@-->',
  '<!-- @joggr:version(v1):end -->',
  '<!-- @joggr:warning:start -->',
  '<!-- ',
  '  ASCII ART WARNING',
  '-->',
  '<!-- @joggr:warning:end -->',
  '<div>',
  '    <p align="center">',
  '        <img src="/assets/repo-icon.png" align="center" width="500" />',
  '    </p>',
  '    <hr>',
  '</div>',
  '',
  '> GitHub tools, templates, and more for the Joggr Team!',
  '',
  '<br />',
  '',
  '## Overview',
  '',
  'This repository includes reusable workflows and other tools.',
  '',
  '<!-- @joggr:editLink(5c94cc57-53b7-4f47-a694-c2cc56bb913d):start -->',
  '---',
  '<a href="https://app.joggr.io/app/documents/abc/edit" alt="Edit doc on Joggr">',
  '  <img src="https://storage.googleapis.com/joggr-public-assets/github/badges/edit-document-badge.svg" />',
  '</a>',
  '<!-- @joggr:editLink(5c94cc57-53b7-4f47-a694-c2cc56bb913d):end -->',
  '',
].join('\n')

test('isCandidate detects file marker', () => {
  assert.equal(isCandidate('<!--@@joggrdoc@@-->\n# Hi'), true)
})

test('isCandidate detects block marker', () => {
  assert.equal(isCandidate('# Hi\n<!-- @joggr:editLink(x):start -->\n'), true)
})

test('isCandidate ignores files without markers', () => {
  assert.equal(isCandidate('# Just a doc\nNo joggr here.'), false)
})

test('drops content of warning + editLink, preserves user prose', () => {
  const { content, changed, stats } = trimJoggrMarkers(REAL_JOGGR_DOC)

  assert.equal(changed, true)
  assert.equal(stats.fileMarker, 1)
  assert.equal(stats.version, 1)
  assert.equal(stats.blocksContentDropped, 2, 'warning + editLink content dropped')
  assert.equal(stats.blocksMarkersOnly, 0)
  assert.equal(stats.unbalanced, false)

  assert.equal(content.includes('@joggrdoc'), false)
  assert.equal(content.includes('@joggr:'), false)
  assert.equal(content.includes('Edit doc on Joggr'), false)
  assert.equal(content.includes('## Overview'), true, 'user prose preserved')
  assert.equal(content.includes('<img src="/assets/repo-icon.png"'), true)
})

test('preserves a markdown doc that has no markers at all', () => {
  const input = '# Hello\n\nNothing to see here.\n'
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(content, input)
  assert.equal(changed, false)
  assert.equal(stats.unbalanced, false)
})

test('refuses to mutate a file with an unmatched :start marker', () => {
  const input = [
    '<!--@@joggrdoc@@-->',
    '<!-- @joggr:warning:start -->',
    'this block has no end marker',
    '## Heading',
    '',
  ].join('\n')
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(changed, false)
  assert.equal(content, input, 'original returned unchanged')
  assert.equal(stats.unbalanced, true)
})

test('does not touch markers inside fenced code blocks', () => {
  const input = [
    '# Docs',
    '',
    'Here is an example of a Joggr marker (DO NOT STRIP):',
    '',
    '```md',
    '<!--@@joggrdoc@@-->',
    '<!-- @joggr:warning:start -->',
    '<!-- @joggr:warning:end -->',
    '```',
    '',
    'And a real one below:',
    '',
    '<!-- @joggr:version(v1):end -->',
    '',
  ].join('\n')
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(changed, true)
  assert.equal(content.includes('```md\n<!--@@joggrdoc@@-->'), true)
  assert.equal(content.includes('<!-- @joggr:warning:start -->\n<!-- @joggr:warning:end -->'), true)
  assert.equal(stats.version, 1)
  assert.equal(stats.fileMarker, 0)
})

test('handles tilde fences as well as backtick fences', () => {
  const input = ['~~~md', '<!-- @joggr:version(v1):end -->', '~~~', ''].join('\n')
  const { content, changed } = trimJoggrMarkers(input)
  assert.equal(changed, false)
  assert.equal(content, input)
})

test('matches editLink blocks by their full param (uuid) so distinct blocks pair correctly', () => {
  const input = [
    '<!-- @joggr:editLink(aaa):start -->',
    'badge A',
    '<!-- @joggr:editLink(aaa):end -->',
    '',
    '<!-- @joggr:editLink(bbb):start -->',
    'badge B',
    '<!-- @joggr:editLink(bbb):end -->',
    '',
  ].join('\n')
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(changed, true)
  assert.equal(stats.blocksContentDropped, 2)
  assert.equal(content.includes('badge A'), false)
  assert.equal(content.includes('badge B'), false)
})

test('a mismatched-param :end is treated as a stray and leaves the open block unbalanced', () => {
  const input = [
    '<!-- @joggr:editLink(aaa):start -->',
    'badge',
    '<!-- @joggr:editLink(bbb):end -->',
    '',
  ].join('\n')
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(changed, false)
  assert.equal(content, input)
  assert.equal(stats.unbalanced, true)
})

test('collapses excessive blank lines left by trimming', () => {
  const input = [
    '<!--@@joggrdoc@@-->',
    '<!-- @joggr:version(v1):end -->',
    '<!-- @joggr:warning:start -->',
    'warning',
    '<!-- @joggr:warning:end -->',
    '',
    '',
    '# Title',
    '',
    'body',
    '',
  ].join('\n')
  const { content } = trimJoggrMarkers(input)
  assert.equal(/\n\n\n\n/.test(content), false)
  assert.equal(content.startsWith('\n'), false)
  assert.equal(content.startsWith('# Title'), true)
})

test('preserves CRLF line endings if that is what the file used', () => {
  const input = '<!--@@joggrdoc@@-->\r\n# Title\r\nbody\r\n'
  const { content, changed } = trimJoggrMarkers(input)
  assert.equal(changed, true)
  assert.equal(content.includes('\r\n'), true)
  assert.equal(content.includes('@joggr'), false)
})

// --- CRITICAL: content-preserving block types -------------------------------
//
// These prevent us from deleting users' code. If any fail, the trimmer is
// silently eating user content.

test('snippet block: markers stripped, code block between them preserved', () => {
  const input = [
    '# Code',
    '',
    '<!-- @joggr:snippet(67c07111-3225-7891-4ce7-72104642142e):start -->',
    '```js',
    "const aCodeSnippet = 'This is a code snippet';",
    '```',
    '<!-- @joggr:snippet(67c07111-3225-7891-4ce7-72104642142e):end -->',
    '',
  ].join('\n')
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(changed, true)
  assert.equal(stats.blocksMarkersOnly, 1)
  assert.equal(stats.blocksContentDropped, 0)
  assert.equal(content.includes('@joggr:'), false)
  assert.equal(content.includes("const aCodeSnippet = 'This is a code snippet';"), true)
  assert.equal(content.includes('```js'), true)
})

test('createSnippet with complex serialized params: markers stripped, code preserved', () => {
  const input = [
    '<!-- @joggr:createSnippet(joggr::launchpad::develop-backup::src/foobar.ts::10::20):start -->',
    '```typescript',
    '// This is a comment!!',
    "console.log('Hello World!!!!');",
    '```',
    '<!-- @joggr:createSnippet(joggr::launchpad::develop-backup::src/foobar.ts::10::20):end -->',
    '',
  ].join('\n')
  const { content, changed, stats } = trimJoggrMarkers(input)
  assert.equal(changed, true)
  assert.equal(stats.blocksMarkersOnly, 1)
  assert.equal(content.includes('@joggr:'), false)
  assert.equal(content.includes("console.log('Hello World!!!!');"), true)
})

test('autoTarget, codeLink, createCodeLink: markers stripped, content preserved (defensive default)', () => {
  for (const name of ['autoTarget', 'codeLink', 'createCodeLink']) {
    const input = [
      `<!-- @joggr:${name}(some-id):start -->`,
      'IMPORTANT USER CONTENT',
      `<!-- @joggr:${name}(some-id):end -->`,
      '',
    ].join('\n')
    const { content, changed, stats } = trimJoggrMarkers(input)
    assert.equal(changed, true, `${name}: should change`)
    assert.equal(stats.blocksMarkersOnly, 1, `${name}: counted as markers-only`)
    assert.equal(stats.blocksContentDropped, 0, `${name}: no content dropped`)
    assert.equal(content.includes('IMPORTANT USER CONTENT'), true, `${name}: content preserved`)
    assert.equal(content.includes('@joggr:'), false, `${name}: markers gone`)
  }
})

test('mixed doc with header + snippet + createSnippet + editLink matches bashir stripAll semantics', () => {
  // Built from bashir's own `multiple-snippets.md` fixture in stargate.
  const input = [
    '<!--@@joggrdoc@@-->',
    '<!-- @joggr:version(v2):end -->',
    '<!-- @joggr:warning:start -->',
    '<!-- WARNING ASCII ART -->',
    '<!-- @joggr:warning:end -->',
    '',
    '## Create Snippet 1',
    '',
    '<!-- @joggr:createSnippet(joggr::launchpad::develop-backup::src/foobar.ts::10::20):start -->',
    '```typescript',
    '// This is a comment!!',
    "console.log('Hello World!!!!');",
    '```',
    '<!-- @joggr:createSnippet(joggr::launchpad::develop-backup::src/foobar.ts::10::20):end -->',
    '',
    '## Code 1',
    '',
    '<!-- @joggr:snippet(231-fasdafd21-123321-1fadsfdsa):start -->',
    '```typescript',
    '// This is a comment',
    "console.log('Hello World AGAIN');",
    '```',
    '<!-- @joggr:snippet(231-fasdafd21-123321-1fadsfdsa):end -->',
    '',
    '<!-- @joggr:editLink(12414123313122):start -->',
    '---',
    '<a href="https://app.joggr.io/app/documents/12414123313122/edit">edit</a>',
    '<!-- @joggr:editLink(12414123313122):end -->',
    '',
  ].join('\n')

  const { content, changed, stats } = trimJoggrMarkers(input)

  assert.equal(changed, true)
  assert.equal(stats.fileMarker, 1)
  assert.equal(stats.version, 1)
  assert.equal(stats.blocksContentDropped, 2)
  assert.equal(stats.blocksMarkersOnly, 2)
  assert.equal(stats.unbalanced, false)

  assert.equal(/@joggr/.test(content), false)
  assert.equal(/@@joggrdoc@@/.test(content), false)
  assert.equal(content.includes('## Create Snippet 1'), true)
  assert.equal(content.includes("console.log('Hello World!!!!');"), true)
  assert.equal(content.includes("console.log('Hello World AGAIN');"), true)
  assert.equal(content.includes('## Code 1'), true)
  assert.equal(content.includes('edit</a>'), false)
})

test('findJoggrDocs only returns files with markers and respects skip dirs and skipPaths', async () => {
  const dir = await trackedTmp('joggr-docs-test-')
  await writeFile(join(dir, 'with-marker.md'), REAL_JOGGR_DOC, 'utf-8')
  await writeFile(join(dir, 'no-marker.md'), '# Just text\n', 'utf-8')
  await writeFile(join(dir, 'note.txt'), '<!--@@joggrdoc@@-->\nignored\n', 'utf-8')
  await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true })
  await writeFile(join(dir, 'node_modules', 'pkg', 'README.md'), REAL_JOGGR_DOC, 'utf-8')
  await mkdir(join(dir, 'tool'), { recursive: true })
  await writeFile(join(dir, 'tool', 'README.md'), REAL_JOGGR_DOC, 'utf-8')

  const foundAll = await findJoggrDocs(dir)
  assert.deepEqual(
    foundAll.map((f) => f.relPath),
    ['tool/README.md', 'with-marker.md'],
    'no skipPaths: tool dir included'
  )

  const foundSkipped = await findJoggrDocs(dir, { skipPaths: new Set([join(dir, 'tool')]) })
  assert.deepEqual(
    foundSkipped.map((f) => f.relPath),
    ['with-marker.md'],
    'skipPaths excludes tool dir entirely'
  )
})
