# GitHub Client SDK

Octokit-style GitHub client for interacting with the GitHub API via the `gh` CLI.

## Usage

```typescript
import { createGitHubClient } from './github-client.js'

// Create client (GraphQL queries are auto-loaded)
const [clientError, github] = await createGitHubClient()
if (clientError) {
  console.error('Failed to create GitHub client:', clientError.message)
  process.exit(1)
}

// Use the client
const [error, issue] = await github.issues.create({
  title: 'New Feature',
  body: '# Description\n\nFeature details...',
})

if (error) {
  console.error(`Failed: ${error.message}`)
  return
}

console.log(`Created issue #${issue.number}`)
```

## API

### Issues

```typescript
// Get issue
const [error, issue] = await github.issues.get(42)

// Create issue
const [error, issue] = await github.issues.create({
  title: 'Bug fix',
  body: 'Description...',
})

// Update issue
const [error] = await github.issues.update({
  issueNumber: 42,
  body: 'Updated description...',
})

// Search issues
const [error, issue] = await github.issues.search({
  title: 'Exact title match',
})
```

### Projects

```typescript
// Get project metadata
const [error, project] = await github.projects.get({
  owner: 'org',
  number: 9,
})

// List fields
const [error, fields] = await github.projects.fields.list({
  owner: 'org',
  number: 9,
})

// Create field
const [error] = await github.projects.fields.create({
  owner: 'org',
  number: 9,
  name: 'Status',
  dataType: 'SINGLE_SELECT',
  singleSelectOptions: [
    { name: 'Todo', color: 'GRAY' },
    { name: 'Done', color: 'GREEN' },
  ],
})

// Delete field
const [error] = await github.projects.fields.delete({
  fieldId: 'PVTF_...',
})

// Update field options
const [error] = await github.projects.fields.updateOptions({
  fieldId: 'PVTF_...',
  options: [
    { name: 'Backlog', color: 'GRAY' },
    { name: 'In Progress', color: 'YELLOW' },
  ],
})

// List items
const [error, items] = await github.projects.items.list({
  owner: 'org',
  number: 9,
  limit: 100,
})

// Add item
const [error, itemId] = await github.projects.items.add({
  owner: 'org',
  number: 9,
  projectId: 'PVT_...',
  issueUrl: 'https://github.com/org/repo/issues/42',
  statusFieldId: 'PVTF_...',
  statusOptionId: 'option-id',
})

// List views
const [error, views] = await github.projects.views.list({
  owner: 'org',
  number: 9,
})
```

### Raw GraphQL

```typescript
const [error, response] = await github.graphql({
  query: 'query { viewer { login } }',
  variables: { foo: 'bar' },
})
```

## GraphQL Queries

GraphQL queries are stored in `scripts/lib/queries/` and loaded at runtime:

- `get-project.graphql` - Fetch project metadata
- `list-project-views.graphql` - List project views
- `update-field-options.graphql` - Update field options

To add a new query:

1. Create a `.graphql` file in `scripts/lib/queries/`
2. Add it to the `Queries` interface in `query-loader.ts`
3. Add a loader call in `loadQueries()`
4. Use it in the client methods

## Error Handling

All methods return `Result<T, GitHubError>` tuples:

```typescript
const [error, data] = await github.issues.get(42)

if (error) {
  console.error(error.type) // 'api_error' | 'parse_error' | 'not_found'
  console.error(error.message)
  console.error(error.code) // optional exit code
  return
}

// data is now typed and safe to use
console.log(data.title)
```

## Design

- **Factory pattern** - `createGitHubClient(queries)` returns interface
- **Result types** - No exceptions, errors as values
- **Object parameters** - Named params for clarity
- **Full JSDoc** - All functions documented
- **TypeScript standards** - Follows `@contributing/standards/typescript/`
