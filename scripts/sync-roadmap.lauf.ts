import { execFile, spawn } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { lauf, z } from 'laufen'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const execFileAsync = promisify(execFile)

const FEATURES_DIR = 'docs/roadmap/features'
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/
const BATCH_SIZE = 5
const MAX_BODY_SECTIONS = 3

const PROJECT_OWNER = 'joggrdocs'
const PROJECT_NUMBER = 9
const PROJECT_ID = 'PVT_kwDOAyJs4c4BQ0Ks'
const STATUS_FIELD_ID = 'PVTSSF_lADOAyJs4c4BQ0Kszg-04b0'

interface Frontmatter {
  status?: string
  issue?: number | null
}

interface FeatureFile {
  filename: string
  filepath: string
  title: string
  body: string
  raw: string
  frontmatter: Frontmatter
}

interface ProjectStatusOption {
  id: string
  name: string
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; content: string } | null {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {return null}

  const frontmatter = parseYaml(match[1]) as Frontmatter
  const content = raw.slice(match[0].length).replace(/^\n+/, '')

  return { frontmatter, content }
}

function updateFrontmatter(raw: string, updates: Partial<Frontmatter>): string {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {return raw}

  const frontmatter = { ...(parseYaml(match[1]) as Frontmatter), ...updates }
  const rest = raw.slice(match[0].length)

  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---${rest}`
}

/**
 * Builds the issue body from the markdown content (without frontmatter).
 *
 * Includes the H1 title and the first N `##` sections.
 */
function buildIssueBody(content: string): { title: string; body: string } | null {
  const lines = content.split('\n')

  const titleIdx = lines.findIndex((l) => /^#\s+/.test(l))
  if (titleIdx === -1) {return null}
  const title = lines[titleIdx].replace(/^#\s+/, '').trim()

  const sections: string[][] = []
  let current: string[] | null = null

  for (let i = titleIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      if (sections.length >= MAX_BODY_SECTIONS) {break}
      current = [lines[i]]
      sections.push(current)
    } else if (current) {
      current.push(lines[i])
    }
  }

  const bodyParts = [`# ${title}`, '']
  for (const section of sections) {
    while (section.length > 1 && section[section.length - 1].trim() === '') {
      section.pop()
    }
    bodyParts.push(...section, '')
  }

  return { title, body: bodyParts.join('\n').trimEnd() + '\n' }
}

async function fetchStatusOptions(): Promise<Map<string, string>> {
  const { stdout } = await execFileAsync('gh', [
    'project',
    'field-list',
    String(PROJECT_NUMBER),
    '--owner',
    PROJECT_OWNER,
    '--format',
    'json',
  ])

  const data = JSON.parse(stdout) as {
    fields: Array<{ id: string; name: string; options?: ProjectStatusOption[] }>
  }
  const statusField = data.fields.find((f) => f.id === STATUS_FIELD_ID)

  if (!statusField?.options) {
    throw new Error('Could not find Status field options in project')
  }

  const map = new Map<string, string>()
  for (const opt of statusField.options) {
    map.set(opt.name, opt.id)
  }
  return map
}

async function createGitHubIssue(
  title: string,
  body: string
): Promise<{ number: number; url: string }> {
  const issueUrl = await new Promise<string>((resolve, reject) => {
    const proc = spawn('gh', ['issue', 'create', '--title', title, '--body-file', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `gh exited with code ${code}`))
      } else {
        resolve(stdout.trim())
      }
    })

    proc.stdin.write(body)
    proc.stdin.end()
  })

  const match = issueUrl.match(/\/issues\/(\d+)$/)
  if (!match) {
    throw new Error(`Could not parse issue number from: ${issueUrl}`)
  }

  return { number: parseInt(match[1], 10), url: issueUrl }
}

async function addToProject(
  issueUrl: string,
  status: string | undefined,
  statusOptions: Map<string, string>
): Promise<void> {
  const { stdout } = await execFileAsync('gh', [
    'project',
    'item-add',
    String(PROJECT_NUMBER),
    '--owner',
    PROJECT_OWNER,
    '--url',
    issueUrl,
    '--format',
    'json',
  ])

  const { id: itemId } = JSON.parse(stdout) as { id: string }

  const optionId = status ? statusOptions.get(status) : undefined
  if (optionId) {
    await execFileAsync('gh', [
      'project',
      'item-edit',
      '--project-id',
      PROJECT_ID,
      '--id',
      itemId,
      '--field-id',
      STATUS_FIELD_ID,
      '--single-select-option-id',
      optionId,
    ])
  }
}

async function selectFromBatch(
  ctx: Parameters<Parameters<typeof lauf>[0]['run']>[0],
  features: FeatureFile[],
  batchIndex: number,
  totalBatches: number
): Promise<FeatureFile[]> {
  const batchLabel = totalBatches > 1 ? ` (batch ${batchIndex + 1}/${totalBatches})` : ''

  const [err, selected] = await ctx.prompts.multiselect({
    message: `Select issues to create${batchLabel}`,
    options: features.map((f) => ({ value: f.filename, label: f.title })),
    initialValues: features.map((f) => f.filename),
  })

  if (err?.cancelled) {return []}

  const selectedSet = new Set(selected)
  return features.filter((f) => selectedSet.has(f.filename))
}

export default lauf({
  description: 'Syncs roadmap features to GitHub issues',
  args: {
    verbose: z.boolean().default(false).describe('Enable verbose logging'),
    'dry-run': z.boolean().default(false).describe('Preview without creating issues'),
  },
  async run(ctx) {
    const featuresDir = join(ctx.root, FEATURES_DIR)

    if (ctx.args.verbose) {
      ctx.logger.info(`Scanning features in ${featuresDir}`)
    }

    const files = await readdir(featuresDir)
    const mdFiles = files.filter((f) => f.endsWith('.md')).toSorted()

    if (mdFiles.length === 0) {
      ctx.logger.warn('No feature files found')
      return 0
    }

    ctx.logger.info(`Found ${mdFiles.length} feature file(s)`)

    const features: FeatureFile[] = []

    for (const filename of mdFiles) {
      const filepath = join(featuresDir, filename)
      const raw = await readFile(filepath, 'utf-8')

      const parsed = parseFrontmatter(raw)
      if (!parsed) {
        ctx.logger.warn(`Skipping ${filename}: no frontmatter`)
        continue
      }

      if (parsed.frontmatter.issue) {
        if (ctx.args.verbose) {
          ctx.logger.info(
            `Skipping ${filename}: already linked to issue #${parsed.frontmatter.issue}`
          )
        }
        continue
      }

      const built = buildIssueBody(parsed.content)
      if (!built) {
        ctx.logger.warn(`Skipping ${filename}: no title found`)
        continue
      }

      features.push({
        filename,
        filepath,
        title: built.title,
        body: built.body,
        raw,
        frontmatter: parsed.frontmatter,
      })
    }

    if (features.length === 0) {
      ctx.logger.success('All features already have issues')
      return 0
    }

    ctx.logger.info(`${features.length} feature(s) need issues`)

    if (ctx.args['dry-run']) {
      for (const feature of features) {
        const statusLabel = feature.frontmatter.status ? ` [${feature.frontmatter.status}]` : ''
        ctx.logger.message(`  - ${feature.title}${statusLabel}`)
      }
      return 0
    }

    // Fetch project status options once upfront
    ctx.spinner.start('Fetching project status options...')
    const statusOptions = await fetchStatusOptions()
    ctx.spinner.stop('Fetched project status options')

    // Validate that all required statuses exist in the project
    const usedStatuses = [
      ...new Set(features.map((f) => f.frontmatter.status).filter(Boolean)),
    ] as string[]
    const missingStatuses = usedStatuses.filter((s) => !statusOptions.has(s))

    if (missingStatuses.length > 0) {
      ctx.logger.error(`Missing project status options: ${missingStatuses.join(', ')}`)
      return 1
    }

    // Batch features and prompt for approval
    const batches: FeatureFile[][] = []
    for (let i = 0; i < features.length; i += BATCH_SIZE) {
      batches.push(features.slice(i, i + BATCH_SIZE))
    }

    let created = 0

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]

      const selected = await selectFromBatch(ctx, batch, i, batches.length)
      if (selected.length === 0) {
        ctx.logger.warn(`Skipped batch ${i + 1}`)
        continue
      }

      for (const feature of selected) {
        ctx.spinner.start(`Creating issue for "${feature.title}"`)

        try {
          const issue = await createGitHubIssue(feature.title, feature.body)

          ctx.spinner.message(`Adding #${issue.number} to project...`)
          await addToProject(issue.url, feature.frontmatter.status, statusOptions)

          const updated = updateFrontmatter(feature.raw, { issue: issue.number })
          await writeFile(feature.filepath, updated)

          const statusLabel = feature.frontmatter.status ? ` [${feature.frontmatter.status}]` : ''
          ctx.spinner.stop(`Created issue #${issue.number}${statusLabel} for "${feature.title}"`)
          created++
        } catch (err) {
          ctx.spinner.stop()
          ctx.logger.error(`Failed to create issue for "${feature.title}": ${err}`)
        }
      }
    }

    ctx.logger.newlines()
    ctx.logger.success(`Created ${created} issue(s)`)
  },
})
