---
description: Add a new item to the product roadmap. Creates the feature markdown file, updates the overview table, searches for existing GitHub issues, and optionally creates a new issue.
disable-model-invocation: true
---

# Roadmap Item Management

Add new items to the product roadmap at `docs/roadmap/`. Each roadmap item consists of a feature markdown file and a corresponding row in the overview table, optionally linked to a GitHub issue.

## Workflow

### Step 1: Load Project Configuration

Read `scripts/conf/project.json` at the repository root to get the current list of valid statuses from the `fields` array (the `Status` field with type `SINGLE_SELECT`). Use these as the only allowed status values throughout the workflow.

### Step 2: Gather Information

Collect the following from the user before proceeding:

| Field | Required | Notes |
|-------|----------|-------|
| Title | Yes | Human-readable feature name |
| Status | Yes | ! One of the statuses from `scripts/conf/project.json` |
| Summary | Yes | One-sentence description of the feature |
| Problem | Yes | What limitation or gap this addresses |
| Solution | Yes | How the feature solves the problem |
| Impact | Yes | What users gain from this feature |
| GitHub Issue | No | Whether to search for / create a GitHub issue |

Use `AskUserQuestion` to collect any missing fields. All six content fields (Title, Summary, Problem, Solution, Impact, and Status) are required before creating the file.

For the Status field, present the valid options loaded from `scripts/conf/project.json` using `AskUserQuestion` with `!` to indicate required selection.

### Step 3: Search for Existing Issues

Before creating a new issue, search for existing ones to avoid duplicates:

```bash
gh issue list --repo joggrdocs/home --search "<title or keywords>" --state all --limit 10
```

Present any matches to the user and ask whether to link an existing issue or create a new one.

### Step 4: Create GitHub Issue (if requested)

When the user wants a new issue, create it with the `enhancement` label:

```bash
gh issue create \
  --repo joggrdocs/home \
  --title "<Title>" \
  --label "enhancement" \
  --body "$(cat <<'EOF'
## Summary

<Summary text>

## Problem

<Problem text>

## Solution

<Solution text>

## Impact

<Impact text>
EOF
)"
```

Capture the issue number from the output for use in the overview table.

### Step 5: Create Feature File

Generate the filename by converting the title to kebab-case (lowercase, hyphens for spaces, strip special characters). Write the file to `docs/roadmap/features/<kebab-case-name>.md`.

Use the format documented in `references/feature-template.md`. Feature files use YAML frontmatter for metadata:

```yaml
---
status: <Status>
issue: <issue number or empty>
---
```

The status badge colors follow a darkwave/synthwave palette:

| Status | Color | Badge |
|--------|-------|-------|
| Idea | Electric Purple | `![Idea](https://img.shields.io/badge/Idea-%238a04ed)` |
| Planned | Imperial Blue | `![Planned](https://img.shields.io/badge/Planned-%230C1565)` |
| In progress | Burnt Orange | `![In progress](https://img.shields.io/badge/In%20progress-%23e85d04)` |
| Released | Dark Teal | `![Released](https://img.shields.io/badge/Released-%2300a67e)` |

### Step 6: Update Overview Table

Append a new row to the table in `docs/roadmap/overview.md`. The row format is:

```
| [<Title>](./features/<kebab-case-name>.md) | <Summary> | ![<Status>](https://img.shields.io/badge/<Status>-<color>) | <issue-link-or-dash> |
```

Column order is: Feature, Description, Status, Issue.

- For the issue column, use `[#N](https://github.com/joggrdocs/home/issues/N)` if an issue exists, otherwise use `-`.
- Insert the new row in the correct status group: Released items first, then In progress, then Planned, then Idea.
- For `In progress` status in badge URLs, use `In%20progress` to encode the space.

### Step 7: Confirm

After creating the files, display a summary:

- Feature file path
- Overview table updated
- GitHub issue link (if created)

## Reference Files

- **`references/feature-template.md`** — Complete feature file template with correct frontmatter and badge format
