import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
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
  options?: Array<{ name: string; description?: string }>
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
  ctx: Parameters<Parameters<typeof lauf>[0]['run']>[0],
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
    if (!ghField) {continue}

    if (field.type === 'SINGLE_SELECT' && field.options) {
      const configOptionNames = field.options.map((o) => o.name)
      const ghOptionNames = ghField.options?.map((o) => o.name) ?? []

      if (
        configOptionNames.length !== ghOptionNames.length ||
        configOptionNames.some((name, i) => name !== ghOptionNames[i])
      ) {
        toUpdate.push({ config: field, github: ghField })
      }
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
        color: 'GRAY',
      })),
    )
    args.push('--single-select-options', optionsJson)
  }

  await execFileAsync('gh', args)
}

async function deleteField(fieldId: string): Promise<void> {
  await execFileAsync('gh', ['project', 'field-delete', '--id', fieldId])
}

async function updateFieldOptions(
  projectId: string,
  fieldId: string,
  config: ConfigField,
  existingOptions: Array<{ id: string; name: string }>,
): Promise<void> {
  if (!config.options) {return}

  const existingByName = new Map(existingOptions.map((o) => [o.name, o.id]))

  const options = config.options.map((o) => {
    const existingId = existingByName.get(o.name)
    const opt: Record<string, string> = {
      name: o.name,
      description: o.description ?? '',
      color: 'GRAY',
    }
    if (existingId) {
      opt.id = existingId
    }
    return opt
  })

  await graphqlMutation({
    query: `mutation($projectId: ID!, $fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
      updateProjectV2Field(input: {
        projectId: $projectId
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
    variables: { projectId, fieldId, options },
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
    if (!gv) {continue}

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

// --- Main Script ---

export default lauf({
  description: 'Syncs GitHub Project v2 from project.json',
  args: {
    verbose: z.boolean().default(false).describe('Enable verbose logging'),
    'dry-run': z.boolean().default(false).describe('Preview changes without applying'),
  },
  async run(ctx) {
    const dryRun = ctx.args['dry-run']

    if (dryRun) {
      ctx.logger.warn('Dry run mode: no changes will be applied')
    }

    // Step 1: Read config
    ctx.spinner.start('Reading project config...')
    const config = await readProjectConfig(ctx.root)
    ctx.spinner.stop(`Read config for project #${config.project.number} (${config.project.owner})`)

    const { owner, number } = config.project

    // Step 2: Fetch current state (parallel)
    ctx.spinner.start('Fetching current project state...')
    const [metadata, fields, views] = await Promise.all([
      fetchProjectMetadata(owner, number),
      fetchProjectFields(owner, number),
      fetchProjectViews(owner, number),
    ])
    ctx.spinner.stop('Fetched project state')

    if (ctx.args.verbose) {
      ctx.logger.info(`Project ID: ${metadata.id}`)
      ctx.logger.info(`Fields: ${fields.map((f) => f.name).join(', ')}`)
      ctx.logger.info(`Views: ${views.map((v) => v.name).join(', ')}`)
    }

    // Step 3: Sync metadata
    ctx.logger.newlines()
    ctx.logger.info('── Metadata ──')
    await syncMetadata(config.project, metadata, dryRun, ctx)

    // Step 4: Sync fields
    ctx.logger.newlines()
    ctx.logger.info('── Fields ──')
    const diff = computeFieldDiffs(config.fields, fields)

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
        ctx.logger.info(`Fields to update options: ${diff.toUpdate.map((f) => f.config.name).join(', ')}`)
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
          ctx.spinner.start(`Creating field "${field.name}"...`)
          await createField(owner, number, field)
          ctx.spinner.stop(`Created field "${field.name}"`)
        }

        // Update field options
        for (const { config: fieldConfig, github: ghField } of diff.toUpdate) {
          ctx.spinner.start(`Updating options for "${fieldConfig.name}"...`)
          await updateFieldOptions(metadata.id, ghField.id, fieldConfig, ghField.options ?? [])
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
  },
})
