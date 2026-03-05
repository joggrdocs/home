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

Reads `scripts/conf/project.json` and syncs the GitHub Project v2 configuration to match. This covers:

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

The project is configured in [`scripts/conf/project.json`](../../scripts/conf/project.json). Key sections:

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

## Badges

We use [shields.io](https://shields.io) badges throughout the documentation and roadmap. All badges follow consistent styling and color conventions.

### Status Badges

Status badges indicate the current state of features in the roadmap. Use `flat-square` style for tables. Colors follow a darkwave/synthwave palette for high contrast in dark mode.

| Status | Color | Badge | Code |
|--------|-------|-------|------|
| Released | Dark Teal (`00a67e`) | ![Released](https://img.shields.io/badge/Released-00a67e?style=flat-square) | `![Released](https://img.shields.io/badge/Released-00a67e?style=flat-square)` |
| In Progress | Burnt Orange (`e85d04`) | ![In Progress](https://img.shields.io/badge/In%20Progress-e85d04?style=flat-square) | `![In Progress](https://img.shields.io/badge/In%20Progress-e85d04?style=flat-square)` |
| Planned | Imperial Blue (`0C1565`) | ![Planned](https://img.shields.io/badge/Planned-0C1565?style=flat-square) | `![Planned](https://img.shields.io/badge/Planned-0C1565?style=flat-square)` |
| Upcoming | Imperial Blue (`0C1565`) | ![Upcoming](https://img.shields.io/badge/Upcoming-0C1565?style=flat-square) | `![Upcoming](https://img.shields.io/badge/Upcoming-0C1565?style=flat-square)` |
| Idea | Electric Purple (`8a04ed`) | ![Idea](https://img.shields.io/badge/Idea-8a04ed?style=flat-square) | `![Idea](https://img.shields.io/badge/Idea-8a04ed?style=flat-square)` |

### Action Badges

Action badges link to project views, discussions, or other interactive elements. Always use links with these badges. Uses brand purple (`8B5CF6`).

| Type | Color | Badge | Code |
|------|-------|-------|------|
| View | Purple (`8B5CF6`) | [![View](https://img.shields.io/badge/View-8B5CF6?style=flat-square)](https://github.com) | `[![View](https://img.shields.io/badge/View-8B5CF6?style=flat-square)](URL)` |
| Discuss | Purple (`8B5CF6`) | [![Discuss](https://img.shields.io/badge/Discuss-8B5CF6?style=flat-square)](https://github.com) | `[![Discuss](https://img.shields.io/badge/Discuss-8B5CF6?style=flat-square)](URL)` |

### Profile Badges

GitHub profile badges display contributor avatars. Generated automatically by the `readme` script.

| Style | Badge | Code |
|-------|-------|------|
| Simple | [![@zrosenbauer](https://img.shields.io/badge/%40zrosenbauer-black?style=flat-square&logo=github)](https://github.com/zrosenbauer) | `[![@username](https://img.shields.io/badge/%40username-black?style=flat-square&logo=github)](https://github.com/username)` |

### Header Badges

Header badges appear at the top of the README with logos. Use `for-the-badge` style for headers.

| Type | Badge | Code |
|------|-------|------|
| Roadmap | [![Roadmap](https://img.shields.io/badge/Roadmap-8B5CF6?style=for-the-badge&logo=googlemaps&logoColor=white)](https://github.com) | `[![Roadmap](https://img.shields.io/badge/Roadmap-8B5CF6?style=for-the-badge&logo=googlemaps&logoColor=white)](URL)` |
| Discussions | [![Discussions](https://img.shields.io/badge/Discussions-8B5CF6?style=for-the-badge&logo=imessage&logoColor=white)](https://github.com) | `[![Discussions](https://img.shields.io/badge/Discussions-8B5CF6?style=for-the-badge&logo=imessage&logoColor=white)](URL)` |
| Issues | [![Issues](https://img.shields.io/badge/Issues-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](https://github.com) | `[![Issues](https://img.shields.io/badge/Issues-8B5CF6?style=for-the-badge&logo=github&logoColor=white)](URL)` |

### Badge Guidelines

- **URL encoding** — spaces in labels must be encoded as `%20` (e.g., `In%20Progress`)
- **Color format** — use hex codes without the `#` prefix (e.g., `8B5CF6` not `#8B5CF6`)
- **Style consistency** — use `flat-square` for tables, `for-the-badge` for headers
- **Alt text** — always provide descriptive alt text in square brackets

## Workflow

1. Define or update project structure in `scripts/conf/project.json`
2. Sync the project board: `pnpm exec lauf run project`
3. Add feature markdown files to `docs/roadmap/features/`
4. Create issues from features: `pnpm exec lauf run features`
5. Commit the updated frontmatter (issue numbers) back to the repo
