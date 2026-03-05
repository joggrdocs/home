# Project Management

This repository uses [laufen](https://github.com/joggrdocs/laufen) scripts to manage GitHub Projects v2 and GitHub Issues as code. The two scripts — `project` and `features` — keep the project board and feature-based issues in sync with the configuration files in this repo.

## Prerequisites

- **Node.js** >= 22.0.0
- **pnpm** (see `packageManager` in `package.json` for the pinned version)
- **GitHub CLI (`gh`)** installed and authenticated

### GitHub CLI Authentication

The `project` script requires the `project` scope, which is not included in the default `gh auth login` grant. You must refresh your authentication to include it:

```bash
gh auth refresh -s project
```

Without this scope, any `gh project` commands will fail with a permissions error.

## Scripts

### `project` — Sync GitHub Project v2

Reads `project.json` at the repository root and syncs the GitHub Project v2 configuration to match. This covers:

- **Metadata** — title, description, visibility, readme
- **Custom fields** — creates missing fields, deletes extra fields, updates `SINGLE_SELECT` options
- **View drift detection** — reports layout, grouping, sorting, and filter mismatches between config and GitHub (views are read-only in the API so manual fixes are required)

#### Usage

```bash
# Dry run — preview changes without applying
pnpm exec lauf run project --dry-run=true

# Apply changes
pnpm exec lauf run project

# Verbose output
pnpm exec lauf run project --verbose=true
```

#### Configuration

The project is configured in [`project.json`](../project.json). Key sections:

| Section         | Purpose                                        |
| --------------- | ---------------------------------------------- |
| `project`       | Owner, number, title, description, visibility  |
| `fields`        | Custom field definitions and select options    |
| `views`         | Expected board/table views and their layouts   |
| `statusMapping` | Maps feature file statuses to project statuses |

### `features` — Sync Features to GitHub Issues

Scans `docs/roadmap/features/` for markdown files and creates GitHub Issues for any feature that does not already have one. Created issues are added to the GitHub Project and assigned a status.

#### Usage

```bash
# Dry run — list features that would become issues
pnpm exec lauf run features --dry-run=true

# Create issues (interactive — prompts for confirmation in batches of 5)
pnpm exec lauf run features

# Verbose output
pnpm exec lauf run features --verbose=true
```

#### Feature File Format

Each feature is a markdown file in `docs/roadmap/features/` with YAML frontmatter:

```markdown
---
status: Planned
issue:
---

# Feature Title

## Problem

Description of the problem this feature solves.

## What we're releasing

Description of the solution.

## Expected outcome

What users can expect after this ships.
```

| Frontmatter Field | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `status`          | Maps to a project status option (e.g. `Planned` -> `Todo`)           |
| `issue`           | Left empty initially; populated with the issue number after creation |

Once an issue is created, the script writes the issue number back into the frontmatter so subsequent runs skip it.

## Workflow

1. Define or update project structure in `project.json`
2. Sync the project board: `pnpm exec lauf run project`
3. Add feature markdown files to `docs/roadmap/features/`
4. Create issues from features: `pnpm exec lauf run features`
5. Commit the updated frontmatter (issue numbers) back to the repo
