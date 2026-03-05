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

// --- Types ---

interface FeaturesConfig {
  project: {
    owner: string
    number: number
  }
  statusMapping: Record<string, string>
}

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

interface StatusField {
  id: string
  options: Map<string, string>
}

// --- Helper Functions ---

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; content: string } | null {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    return null
  }

  const frontmatter = parseYaml(match[1]) as Frontmatter
  const content = raw.slice(match[0].length).replace(/^\n+/, '')

  return { frontmatter, content }
}

function updateFrontmatter(raw: string, updates: Partial<Frontmatter>): string {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    return raw
  }

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
  if (titleIdx === -1) {
    return null
  }
  const title = lines[titleIdx].replace(/^#\s+/, '').trim()

  const sections: string[][] = []
  let current: string[] | null = null

  for (let i = titleIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      if (sections.length >= MAX_BODY_SECTIONS) {
        break
      }
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

/**
 * Reads project owner, number, and statusMapping from project.json.
 */
async function readFeaturesConfig(root: string): Promise<FeaturesConfig> {
  const raw = await readFile(join(root, 'project.json'), 'utf-8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const project = parsed.project as FeaturesConfig['project']
  const statusMapping = (parsed.statusMapping ?? {}) as Record<string, string>

  return {
    project: { owner: project.owner, number: project.number },
    statusMapping,
  }
}

/**
 * Fetches the project node ID from the GitHub Projects v2 API.
 */
async function fetchProjectId(owner: string, number: number): Promise<string> {
  const query = `query {
    organization(login: "${owner}") {
      projectV2(number: ${number}) {
        id
      }
    }
  }`

  const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`])
  const data = JSON.parse(stdout)
  return data.data.organization.projectV2.id as string
}

/**
 * Fetches the Status field ID and its option name→ID map from the project.
 */
async function fetchStatusField(owner: string, number: number): Promise<StatusField> {
  const { stdout } = await execFileAsync('gh', [
    'project',
    'field-list',
    String(number),
    '--owner',
    owner,
    '--format',
    'json',
  ])

  const data = JSON.parse(stdout) as {
    fields: Array<{ id: string; name: string; options?: Array<{ id: string; name: string }> }>
  }
  const statusField = data.fields.find((f) => f.name === 'Status')

  if (!statusField || !statusField.options) {
    throw new Error('Could not find Status field with options in project')
  }

  const options = new Map<string, string>()
  for (const opt of statusField.options) {
    options.set(opt.name, opt.id)
  }

  return { id: statusField.id, options }
}

/**
 * Searches for an existing issue with an exact title match.
 *
 * Returns the issue number and URL if found, or null.
 */
async function findExistingIssue(title: string): Promise<{ number: number; url: string } | null> {
  const { stdout } = await execFileAsync('gh', [
    'issue',
    'list',
    '--search',
    `"${title}" in:title`,
    '--state',
    'all',
    '--json',
    'number,title,url',
    '--limit',
    '100',
  ])

  const issues = JSON.parse(stdout) as Array<{ number: number; title: string; url: string }>
  const exact = issues.find((i) => i.title === title)

  if (!exact) {
    return null
  }

  return { number: exact.number, url: exact.url }
}

/**
 * Fetches all items from the GitHub project with their status.
 *
 * Returns a map of issue number to status name.
 */
async function fetchProjectItems(
  owner: string,
  number: number
): Promise<Map<number, string | null>> {
  const { stdout } = await execFileAsync('gh', [
    'project',
    'item-list',
    String(number),
    '--owner',
    owner,
    '--format',
    'json',
    '--limit',
    '1000',
  ])

  const data = JSON.parse(stdout) as {
    items: Array<{
      content: { number?: number }
      status?: string
    }>
  }

  const items = new Map<number, string | null>()
  for (const item of data.items) {
    if (item.content.number) {
      items.set(item.content.number, item.status ?? null)
    }
  }

  return items
}

/**
 * Creates a reverse mapping from GitHub status to local status.
 */
function reverseStatusMapping(mapping: Record<string, string>): Map<string, string> {
  const reversed = new Map<string, string>()
  for (const [localStatus, githubStatus] of Object.entries(mapping)) {
    reversed.set(githubStatus, localStatus)
  }
  return reversed
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

async function addToProject(params: {
  owner: string
  number: number
  projectId: string
  statusFieldId: string
  issueUrl: string
  mappedStatus: string | undefined
  statusOptions: Map<string, string>
}): Promise<void> {
  const { stdout } = await execFileAsync('gh', [
    'project',
    'item-add',
    String(params.number),
    '--owner',
    params.owner,
    '--url',
    params.issueUrl,
    '--format',
    'json',
  ])

  const { id: itemId } = JSON.parse(stdout) as { id: string }

  const optionId = params.mappedStatus ? params.statusOptions.get(params.mappedStatus) : undefined
  if (optionId) {
    await execFileAsync('gh', [
      'project',
      'item-edit',
      '--project-id',
      params.projectId,
      '--id',
      itemId,
      '--field-id',
      params.statusFieldId,
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

  if (err?.cancelled) {
    return []
  }

  const selectedSet = new Set(selected)
  return features.filter((f) => selectedSet.has(f.filename))
}

// --- Main Script ---

export default lauf({
  description: 'Syncs features to GitHub issues',
  args: {
    verbose: z.boolean().default(false).describe('Enable verbose logging'),
    'dry-run': z.boolean().default(false).describe('Preview without creating issues'),
    direction: z
      .enum(['to-github', 'from-github'])
      .optional()
      .describe('Sync direction: to-github or from-github'),
  },
  async run(ctx) {
    let cancelled = false

    const handleInterrupt = () => {
      if (!cancelled) {
        cancelled = true
        ctx.logger.newlines()
        ctx.logger.warn('Received interrupt signal, finishing current operation...')
      }
    }

    const cleanup = () => {
      process.off('SIGINT', handleInterrupt)
      process.off('SIGTERM', handleInterrupt)
    }

    process.on('SIGINT', handleInterrupt)
    process.on('SIGTERM', handleInterrupt)

    try {
      // Determine sync direction
      let direction = ctx.args.direction

      if (!direction) {
        const [promptErr, selected] = await ctx.prompts.select({
          message: 'Select sync direction',
          options: [
            { value: 'to-github', label: 'To GitHub (create/update issues from local files)' },
            { value: 'from-github', label: 'From GitHub (update local files from issues)' },
          ],
        })

        if (promptErr?.cancelled || cancelled) {
          ctx.logger.warn('Cancelled by user')
          return 1
        }

        direction = selected as 'to-github' | 'from-github'
      }

      const featuresDir = join(ctx.root, FEATURES_DIR)

      // Step 1: Read project config from project.json
      ctx.spinner.start('Reading project config...')
      const config = await readFeaturesConfig(ctx.root)
      const { owner, number } = config.project
      ctx.spinner.stop(`Read config for project #${number} (${owner})`)

      if (ctx.args.verbose) {
        ctx.logger.info(`Status mapping: ${JSON.stringify(config.statusMapping)}`)
      }

      // Handle from-github sync
      if (direction === 'from-github') {
        ctx.spinner.start('Fetching project items from GitHub...')
        const projectItems = await fetchProjectItems(owner, number)
        ctx.spinner.stop(`Fetched ${projectItems.size} project item(s)`)

        if (cancelled) {
          ctx.logger.warn('Cancelled by user')
          return 1
        }

        ctx.spinner.start('Scanning local feature files...')
        const files = await readdir(featuresDir)
        const mdFiles = files.filter((f) => f.endsWith('.md')).toSorted()

        if (mdFiles.length === 0) {
          ctx.logger.warn('No feature files found')
          return 0
        }

        ctx.spinner.stop(`Found ${mdFiles.length} feature file(s)`)

        const reverseMapping = reverseStatusMapping(config.statusMapping)
        let updated = 0

        for (const filename of mdFiles) {
          if (cancelled) {
            ctx.logger.warn('Cancelled by user')
            break
          }

          const filepath = join(featuresDir, filename)
          const raw = await readFile(filepath, 'utf-8')

          const parsed = parseFrontmatter(raw)
          if (!parsed) {
            if (ctx.args.verbose) {
              ctx.logger.warn(`Skipping ${filename}: no frontmatter`)
            }
            continue
          }

          const issueNumber = parsed.frontmatter.issue
          if (!issueNumber) {
            if (ctx.args.verbose) {
              ctx.logger.info(`Skipping ${filename}: no linked issue`)
            }
            continue
          }

          const githubStatus = projectItems.get(issueNumber)
          if (githubStatus === undefined) {
            if (ctx.args.verbose) {
              ctx.logger.warn(`Issue #${issueNumber} not found in project`)
            }
            continue
          }

          const localStatus = githubStatus ? reverseMapping.get(githubStatus) : undefined
          if (localStatus === parsed.frontmatter.status) {
            if (ctx.args.verbose) {
              ctx.logger.info(`${filename}: status already in sync`)
            }
            continue
          }

          if (ctx.args['dry-run']) {
            const fromLabel = parsed.frontmatter.status ?? '(none)'
            const toLabel = localStatus ?? '(none)'
            ctx.logger.message(`${filename}: ${fromLabel} → ${toLabel}`)
            updated++
          } else {
            const updatedContent = updateFrontmatter(raw, { status: localStatus })
            await writeFile(filepath, updatedContent)

            const statusLabel = localStatus ? ` [${localStatus}]` : ''
            ctx.logger.success(`Updated ${filename}${statusLabel}`)
            updated++
          }
        }

        ctx.logger.newlines()
        ctx.logger.success(`Updated ${updated} file(s)`)
        return 0
      }

      // Step 2: Scan feature files
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

      // Step 3: Fetch project state in parallel
      ctx.spinner.start('Fetching project status options...')
      const [projectId, statusField] = await Promise.all([
        fetchProjectId(owner, number),
        fetchStatusField(owner, number),
      ])
      ctx.spinner.stop('Fetched project status options')

      // Step 4: Validate that all feature statuses exist in statusMapping
      const usedStatuses = [
        ...new Set(features.map((f) => f.frontmatter.status).filter(Boolean)),
      ] as string[]

      const unmappedStatuses = usedStatuses.filter((s) => !(s in config.statusMapping))
      if (unmappedStatuses.length > 0) {
        ctx.logger.error(
          `Feature statuses not found in statusMapping: ${unmappedStatuses.join(', ')}`
        )
        return 1
      }

      // Validate that all mapped statuses exist in the project
      const mappedStatuses = [...new Set(usedStatuses.map((s) => config.statusMapping[s]))]
      const missingStatuses = mappedStatuses.filter((s) => !statusField.options.has(s))

      if (missingStatuses.length > 0) {
        ctx.logger.error(`Missing project status options: ${missingStatuses.join(', ')}`)
        return 1
      }

      // Step 5: Batch features and prompt for approval
      const batches: FeatureFile[][] = []
      for (let i = 0; i < features.length; i += BATCH_SIZE) {
        batches.push(features.slice(i, i + BATCH_SIZE))
      }

      let created = 0

      for (let i = 0; i < batches.length; i++) {
        if (cancelled) {
          ctx.logger.warn('Cancelled by user')
          break
        }

        const batch = batches[i]

        const selected = await selectFromBatch(ctx, batch, i, batches.length)
        if (selected.length === 0) {
          ctx.logger.warn(`Skipped batch ${i + 1}`)
          continue
        }

        for (const feature of selected) {
          if (cancelled) {
            ctx.logger.warn('Cancelled by user')
            break
          }

          ctx.spinner.start(`Processing "${feature.title}"`)

          try {
            // Search for existing issue with the same title
            const existing = await findExistingIssue(feature.title)
            const mappedStatus = feature.frontmatter.status
              ? config.statusMapping[feature.frontmatter.status]
              : undefined

            if (existing) {
              // Link existing issue instead of creating a duplicate
              const updated = updateFrontmatter(feature.raw, { issue: existing.number })
              await writeFile(feature.filepath, updated)

              ctx.spinner.message(`Adding #${existing.number} to project...`)
              await addToProject({
                owner,
                number,
                projectId,
                statusFieldId: statusField.id,
                issueUrl: existing.url,
                mappedStatus,
                statusOptions: statusField.options,
              })

              const statusLabel = feature.frontmatter.status
                ? ` [${feature.frontmatter.status}]`
                : ''
              ctx.spinner.stop(
                `Linked existing issue #${existing.number}${statusLabel} for "${feature.title}"`
              )
            } else {
              // Create new issue
              const issue = await createGitHubIssue(feature.title, feature.body)

              // Write frontmatter immediately so re-runs don't create duplicates
              const updated = updateFrontmatter(feature.raw, { issue: issue.number })
              await writeFile(feature.filepath, updated)

              ctx.spinner.message(`Adding #${issue.number} to project...`)
              await addToProject({
                owner,
                number,
                projectId,
                statusFieldId: statusField.id,
                issueUrl: issue.url,
                mappedStatus,
                statusOptions: statusField.options,
              })

              const statusLabel = feature.frontmatter.status
                ? ` [${feature.frontmatter.status}]`
                : ''
              ctx.spinner.stop(
                `Created issue #${issue.number}${statusLabel} for "${feature.title}"`
              )
            }

            created++
          } catch (err) {
            ctx.spinner.stop()
            ctx.logger.error(`Failed to process "${feature.title}": ${err}`)
          }
        }
      }

      ctx.logger.newlines()
      ctx.logger.success(`Processed ${created} issue(s)`)
    } finally {
      cleanup()
    }
  },
})
