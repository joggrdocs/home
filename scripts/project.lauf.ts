import { execFile, spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { lauf, z } from 'laufen'

const execFileAsync = promisify(execFile)

/**
 * Built-in project fields that cannot be created or deleted.
 */
const BUILT_IN_FIELDS = new Set([
  'Title',
  'Assignees',
  'Labels',
  'Milestone',
  'Repository',
  'Linked pull requests',
  'Reviewers',
  'Tracked by',
  'Tracks',
  'Parent issue',
  'Sub-issues progress',
])

// --- Config Types ---

interface ProjectConfig {
  project: {
    owner: string
    number: number
    title: string
    description: string
    visibility: 'PUBLIC' | 'PRIVATE'
    readme: string
  }
  fields: ConfigField[]
  views: ConfigView[]
}

interface ConfigField {
  name: string
  type: string
  options?: Array<{ name: string; description?: string; color?: string }>
}

interface ConfigView {
  name: string
  layout: string
  groupBy: string | null
  sortBy: { field: string; direction: string } | null
  fields: string[]
  filter?: string
}

// --- GitHub API Types ---

interface ProjectMetadata {
  id: string
  title: string
  shortDescription: string
  public: boolean
  readme: string
}

interface GitHubField {
  id: string
  name: string
  type: string
  options?: Array<{ id: string; name: string }>
}

interface GitHubView {
  id: string
  name: string
  layout: string
  filter: string | null
  groupByFields: Array<{ name: string }>
  sortByFields: Array<{ field: { name: string }; direction: string }>
  visibleFields: Array<{ name: string }>
}

// --- Diff Types ---

interface FieldDiff {
  toCreate: ConfigField[]
  toDelete: GitHubField[]
  toUpdate: Array<{ config: ConfigField; github: GitHubField }>
}

interface ViewDriftEntry {
  view: string
  type: 'missing_from_github' | 'not_in_config' | 'mismatch'
  details?: string
}

// --- Helper Functions ---

async function readProjectConfig(root: string): Promise<ProjectConfig> {
  const raw = await readFile(join(root, 'project.json'), 'utf-8')
  return JSON.parse(raw) as ProjectConfig
}

async function fetchProjectMetadata(owner: string, number: number): Promise<ProjectMetadata> {
  const query = `query {
    organization(login: "${owner}") {
      projectV2(number: ${number}) {
        id
        title
        shortDescription
        public
        readme
      }
    }
  }`

  const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`])
  const data = JSON.parse(stdout)
  const project = data.data.organization.projectV2

  return {
    ...project,
    shortDescription: project.shortDescription ?? '',
    readme: project.readme ?? '',
  }
}

async function fetchProjectFields(owner: string, number: number): Promise<GitHubField[]> {
  const { stdout } = await execFileAsync('gh', [
    'project',
    'field-list',
    String(number),
    '--owner',
    owner,
    '--format',
    'json',
  ])
  const data = JSON.parse(stdout) as { fields: GitHubField[] }
  return data.fields
}

async function fetchProjectViews(owner: string, number: number): Promise<GitHubView[]> {
  const query = `query {
    organization(login: "${owner}") {
      projectV2(number: ${number}) {
        views(first: 50) {
          nodes {
            id
            name
            layout
            filter
            groupByFields(first: 10) {
              nodes {
                ... on ProjectV2Field { name }
                ... on ProjectV2SingleSelectField { name }
                ... on ProjectV2IterationField { name }
              }
            }
            sortByFields(first: 10) {
              nodes {
                field {
                  ... on ProjectV2Field { name }
                  ... on ProjectV2SingleSelectField { name }
                  ... on ProjectV2IterationField { name }
                }
                direction
              }
            }
            visibleFields(first: 50) {
              nodes {
                name
              }
            }
          }
        }
      }
    }
  }`

  const { stdout } = await execFileAsync('gh', ['api', 'graphql', '-f', `query=${query}`])
  const data = JSON.parse(stdout)
  const nodes = data.data.organization.projectV2.views.nodes

  return nodes.map((v: any) => ({
    id: v.id,
    name: v.name,
    layout: v.layout,
    filter: v.filter ?? null,
    groupByFields: v.groupByFields.nodes,
    sortByFields: v.sortByFields.nodes,
    visibleFields: v.visibleFields.nodes,
  }))
}

async function graphqlMutation(body: Record<string, unknown>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn('gh', ['api', 'graphql', '--input', '-'], {
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

    proc.stdin.write(JSON.stringify(body))
    proc.stdin.end()
  })
}

async function syncMetadata(
  config: ProjectConfig['project'],
  current: ProjectMetadata,
  dryRun: boolean,
  ctx: Parameters<Parameters<typeof lauf>[0]['run']>[0]
): Promise<void> {
  const editArgs = ['project', 'edit', String(config.number), '--owner', config.owner]
  const changes: string[] = []

  if (config.title !== current.title) {
    changes.push(`title: "${current.title}" → "${config.title}"`)
    editArgs.push('--title', config.title)
  }

  if (config.description !== current.shortDescription) {
    changes.push(`description: "${current.shortDescription}" → "${config.description}"`)
    editArgs.push('--description', config.description)
  }

  const configIsPublic = config.visibility === 'PUBLIC'
  if (configIsPublic !== current.public) {
    changes.push(`visibility: ${current.public ? 'PUBLIC' : 'PRIVATE'} → ${config.visibility}`)
    editArgs.push('--visibility', config.visibility)
  }

  if (config.readme !== current.readme) {
    changes.push('readme: changed')
    editArgs.push('--readme', config.readme)
  }

  if (changes.length === 0) {
    ctx.logger.success('Metadata is up to date')
    return
  }

  ctx.logger.info('Metadata changes:')
  for (const change of changes) {
    ctx.logger.info(`  ${change}`)
  }

  if (dryRun) {
    ctx.logger.warn('Dry run: skipping metadata update')
    return
  }

  ctx.spinner.start('Updating project metadata...')
  await execFileAsync('gh', editArgs)
  ctx.spinner.stop('Project metadata updated')
}

function computeFieldDiffs(configFields: ConfigField[], githubFields: GitHubField[]): FieldDiff {
  const customGithubFields = githubFields.filter((f) => !BUILT_IN_FIELDS.has(f.name))

  const githubByName = new Map(customGithubFields.map((f) => [f.name, f]))
  const configByName = new Map(configFields.map((f) => [f.name, f]))

  const toCreate: ConfigField[] = []
  const toDelete: GitHubField[] = []
  const toUpdate: FieldDiff['toUpdate'] = []

  for (const field of configFields) {
    if (!githubByName.has(field.name)) {
      toCreate.push(field)
    }
  }

  for (const field of customGithubFields) {
    if (!configByName.has(field.name)) {
      toDelete.push(field)
    }
  }

  for (const field of configFields) {
    const ghField = githubByName.get(field.name)
    if (!ghField) {
      continue
    }

    if (field.type === 'SINGLE_SELECT' && field.options) {
      toUpdate.push({ config: field, github: ghField })
    }
  }

  return { toCreate, toDelete, toUpdate }
}

async function createField(owner: string, number: number, field: ConfigField): Promise<void> {
  const args = [
    'project',
    'field-create',
    String(number),
    '--owner',
    owner,
    '--name',
    field.name,
    '--data-type',
    field.type,
  ]

  if (field.type === 'SINGLE_SELECT' && field.options) {
    const optionsJson = JSON.stringify(
      field.options.map((o) => ({
        name: o.name,
        description: o.description ?? '',
        color: o.color ?? 'GRAY',
      }))
    )
    args.push('--single-select-options', optionsJson)
  }

  await execFileAsync('gh', args)
}

async function deleteField(fieldId: string): Promise<void> {
  await execFileAsync('gh', ['project', 'field-delete', '--id', fieldId])
}

async function updateFieldOptions(fieldId: string, config: ConfigField): Promise<void> {
  if (!config.options) {
    return
  }

  const options = config.options.map((o) => ({
    name: o.name,
    description: o.description ?? '',
    color: o.color ?? 'GRAY',
  }))

  await graphqlMutation({
    query: `mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      updateProjectV2Field(input: {
        fieldId: $fieldId
        singleSelectOptions: $options
      }) {
        projectV2Field {
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }`,
    variables: { fieldId, options },
  })
}

function detectViewDrift(configViews: ConfigView[], githubViews: GitHubView[]): ViewDriftEntry[] {
  const drifts: ViewDriftEntry[] = []
  const githubByName = new Map(githubViews.map((v) => [v.name, v]))
  const configByName = new Map(configViews.map((v) => [v.name, v]))

  for (const cv of configViews) {
    if (!githubByName.has(cv.name)) {
      drifts.push({ view: cv.name, type: 'missing_from_github' })
    }
  }

  for (const gv of githubViews) {
    if (!configByName.has(gv.name)) {
      drifts.push({ view: gv.name, type: 'not_in_config' })
    }
  }

  for (const cv of configViews) {
    const gv = githubByName.get(cv.name)
    if (!gv) {
      continue
    }

    if (cv.layout !== gv.layout) {
      drifts.push({
        view: cv.name,
        type: 'mismatch',
        details: `layout: config="${cv.layout}" github="${gv.layout}"`,
      })
    }

    const ghGroupBy = gv.groupByFields.map((f) => f.name).join(', ') || null
    if (cv.groupBy !== ghGroupBy) {
      drifts.push({
        view: cv.name,
        type: 'mismatch',
        details: `groupBy: config="${cv.groupBy ?? 'none'}" github="${ghGroupBy ?? 'none'}"`,
      })
    }

    const ghFilter = gv.filter ?? undefined
    const configFilter = cv.filter ?? undefined
    if (configFilter !== ghFilter) {
      drifts.push({
        view: cv.name,
        type: 'mismatch',
        details: `filter: config="${configFilter ?? 'none'}" github="${ghFilter ?? 'none'}"`,
      })
    }
  }

  return drifts
}

function convertGitHubFieldToConfig(field: GitHubField): ConfigField | null {
  if (BUILT_IN_FIELDS.has(field.name)) {
    return null
  }

  const config: ConfigField = {
    name: field.name,
    type: field.type.replace('ProjectV2', '').replace('Field', ''),
  }

  if (field.options) {
    config.options = field.options.map((opt) => ({ name: opt.name }))
  }

  return config
}

function convertGitHubViewToConfig(view: GitHubView): ConfigView {
  const groupBy = view.groupByFields.length > 0 ? view.groupByFields[0].name : null
  const sortBy =
    view.sortByFields.length > 0
      ? {
          field: view.sortByFields[0].field.name,
          direction: view.sortByFields[0].direction,
        }
      : null

  const config: ConfigView = {
    name: view.name,
    layout: view.layout,
    groupBy,
    sortBy,
    fields: view.visibleFields.map((f) => f.name),
  }

  if (view.filter) {
    config.filter = view.filter
  }

  return config
}

async function writeProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const json = JSON.stringify(config, null, 2) + '\n'
  await writeFile(join(root, 'project.json'), json)
}

// --- Main Script ---

export default lauf({
  description: 'Syncs GitHub Project v2 configuration',
  args: {
    verbose: z.boolean().default(false).describe('Enable verbose logging'),
    'dry-run': z.boolean().default(false).describe('Preview changes without applying'),
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
      const dryRun = ctx.args['dry-run']

      if (dryRun) {
        ctx.logger.warn('Dry run mode: no changes will be applied')
      }

      // Determine sync direction
      let direction = ctx.args.direction

      if (!direction) {
        const [promptErr, selected] = await ctx.prompts.select({
          message: 'Select sync direction',
          options: [
            { value: 'to-github', label: 'To GitHub (update GitHub from local config)' },
            { value: 'from-github', label: 'From GitHub (update local config from GitHub)' },
          ],
        })

        if (promptErr?.cancelled || cancelled) {
          ctx.logger.warn('Cancelled by user')
          return 1
        }

        direction = selected as 'to-github' | 'from-github'
      }

      // Step 1: Read config
      ctx.spinner.start('Reading project config...')
      const config = await readProjectConfig(ctx.root)
      ctx.spinner.stop(
        `Read config for project #${config.project.number} (${config.project.owner})`
      )

      const { owner, number } = config.project

      // Handle from-github sync
      if (direction === 'from-github') {
        if (cancelled) {
          ctx.logger.warn('Cancelled by user')
          return 1
        }

        ctx.spinner.start('Fetching project state from GitHub...')
        const [metadata, fields, views] = await Promise.all([
          fetchProjectMetadata(owner, number),
          fetchProjectFields(owner, number),
          fetchProjectViews(owner, number),
        ])
        ctx.spinner.stop('Fetched project state')

        if (cancelled) {
          ctx.logger.warn('Cancelled by user')
          return 1
        }

        const customFields = fields
          .map(convertGitHubFieldToConfig)
          .filter((f): f is ConfigField => f !== null)
        const configViews = views.map(convertGitHubViewToConfig)

        const updatedConfig: ProjectConfig = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          project: {
            owner,
            number,
            title: metadata.title,
            description: metadata.shortDescription,
            visibility: metadata.public ? 'PUBLIC' : 'PRIVATE',
            readme: metadata.readme,
          },
          fields: customFields,
          views: configViews,
          statusMapping: config.statusMapping ?? {},
        }

        if (dryRun) {
          ctx.logger.info('Dry run: would update project.json with:')
          ctx.logger.info(`  Fields: ${customFields.map((f) => f.name).join(', ')}`)
          ctx.logger.info(`  Views: ${configViews.map((v) => v.name).join(', ')}`)
          ctx.logger.info(`  Visibility: ${updatedConfig.project.visibility}`)
        } else {
          ctx.spinner.start('Writing project.json...')
          await writeProjectConfig(ctx.root, updatedConfig)
          ctx.spinner.stop('Updated project.json')
          ctx.logger.success('Project config synced from GitHub')
        }

        return 0
      }

      // Step 2: Fetch current state (parallel)
      ctx.spinner.start('Fetching current project state...')
      const [metadata, fields, views] = await Promise.all([
        fetchProjectMetadata(owner, number),
        fetchProjectFields(owner, number),
        fetchProjectViews(owner, number),
      ])
      ctx.spinner.stop('Fetched project state')

      if (cancelled) {
        ctx.logger.warn('Cancelled by user')
        return 1
      }

      if (ctx.args.verbose) {
        ctx.logger.info(`Project ID: ${metadata.id}`)
        ctx.logger.info(`Fields: ${fields.map((f) => f.name).join(', ')}`)
        ctx.logger.info(`Views: ${views.map((v) => v.name).join(', ')}`)
      }

      // Step 3: Sync metadata
      ctx.logger.newlines()
      ctx.logger.info('── Metadata ──')
      await syncMetadata(config.project, metadata, dryRun, ctx)

      if (cancelled) {
        ctx.logger.warn('Cancelled by user')
        return 1
      }

      // Step 4: Sync fields
      ctx.logger.newlines()
      ctx.logger.info('── Fields ──')
      const diff = computeFieldDiffs(config.fields, fields)

      if (cancelled) {
        ctx.logger.warn('Cancelled by user')
        return 1
      }

      if (diff.toCreate.length === 0 && diff.toDelete.length === 0 && diff.toUpdate.length === 0) {
        ctx.logger.success('Fields are up to date')
      } else {
        if (diff.toCreate.length > 0) {
          ctx.logger.info(`Fields to create: ${diff.toCreate.map((f) => f.name).join(', ')}`)
        }
        if (diff.toDelete.length > 0) {
          ctx.logger.info(`Fields to delete: ${diff.toDelete.map((f) => f.name).join(', ')}`)
        }
        if (diff.toUpdate.length > 0) {
          ctx.logger.info(
            `Fields to update options: ${diff.toUpdate.map((f) => f.config.name).join(', ')}`
          )
        }

        if (!dryRun) {
          // Delete fields (with confirmation)
          if (diff.toDelete.length > 0) {
            const [err, confirmed] = await ctx.prompts.confirm({
              message: `Delete ${diff.toDelete.length} field(s): ${diff.toDelete.map((f) => f.name).join(', ')}?`,
              initialValue: false,
            })

            if (!err?.cancelled && confirmed) {
              for (const field of diff.toDelete) {
                if (cancelled) {
                  ctx.logger.warn('Cancelled by user')
                  break
                }
                ctx.spinner.start(`Deleting field "${field.name}"...`)
                await deleteField(field.id)
                ctx.spinner.stop(`Deleted field "${field.name}"`)
              }
            } else {
              ctx.logger.warn('Skipped field deletion')
            }
          }

          // Create fields
          for (const field of diff.toCreate) {
            if (cancelled) {
              ctx.logger.warn('Cancelled by user')
              break
            }
            ctx.spinner.start(`Creating field "${field.name}"...`)
            await createField(owner, number, field)
            ctx.spinner.stop(`Created field "${field.name}"`)
          }

          // Update field options
          for (const { config: fieldConfig, github: ghField } of diff.toUpdate) {
            if (cancelled) {
              ctx.logger.warn('Cancelled by user')
              break
            }
            ctx.spinner.start(`Updating options for "${fieldConfig.name}"...`)
            await updateFieldOptions(ghField.id, fieldConfig)
            ctx.spinner.stop(`Updated options for "${fieldConfig.name}"`)
          }
        } else {
          ctx.logger.warn('Dry run: skipping field changes')
        }
      }

      // Step 5: Detect view drift
      ctx.logger.newlines()
      ctx.logger.info('── Views ──')
      const drifts = detectViewDrift(config.views, views)

      if (drifts.length === 0) {
        ctx.logger.success('Views match config (no drift detected)')
      } else {
        ctx.logger.warn(`View drift detected (${drifts.length} issue(s)):`)
        for (const drift of drifts) {
          switch (drift.type) {
            case 'missing_from_github':
              ctx.logger.warn(`  "${drift.view}": missing from GitHub`)
              break
            case 'not_in_config':
              ctx.logger.warn(`  "${drift.view}": exists on GitHub but not in config`)
              break
            case 'mismatch':
              ctx.logger.warn(`  "${drift.view}": ${drift.details}`)
              break
          }
        }
        ctx.logger.warn('Views are read-only in the GitHub Projects v2 API — manual fix required')
      }

      ctx.logger.newlines()
      ctx.logger.success('Project sync complete')
    } finally {
      cleanup()
    }
  },
})
