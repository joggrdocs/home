---
name: Roadmap Item
description: Add a new item to the product roadmap. Creates the feature markdown file, updates the overview table, searches for existing GitHub issues, and optionally creates a new issue.
disable-model-invocation: true
---

# Roadmap Item Management

Add new items to the product roadmap at `docs/roadmap/`. Each roadmap item consists of a feature markdown file and a corresponding row in the overview table, optionally linked to a GitHub issue.

## Workflow

### Step 1: Gather Information

Collect the following from the user before proceeding:

| Field | Required | Notes |
|-------|----------|-------|
| Title | Yes | Human-readable feature name |
| Status | Yes | One of: `Released`, `Planned`, `Approved` |
| Summary | Yes | One-sentence description of the feature |
| Problem | Yes | What limitation or gap this addresses |
| Solution | Yes | How the feature solves the problem |
| Impact | Yes | What users gain from this feature |
| GitHub Issue | No | Whether to search for / create a GitHub issue |

Use `AskUserQuestion` to collect any missing fields. All six content fields (Title, Summary, Problem, Solution, Impact, and Status) are required before creating the file.

### Step 2: Search for Existing Issues

Before creating a new issue, search for existing ones to avoid duplicates:

```bash
gh issue list --repo joggrdocs/code --search "<title or keywords>" --state all --limit 10
```

Present any matches to the user and ask whether to link an existing issue or create a new one.

### Step 3: Create GitHub Issue (if requested)

When the user wants a new issue, create it with the `enhancement` label:

```bash
gh issue create \
  --repo joggrdocs/code \
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

### Step 4: Create Feature File

Generate the filename by converting the title to kebab-case (lowercase, hyphens for spaces, strip special characters). Write the file to `docs/roadmap/features/<kebab-case-name>.md`.

Use the format documented in `references/feature-template.md`. The status badge colors are:

| Status | Badge |
|--------|-------|
| Released | `![Released](https://img.shields.io/badge/Released-%23006400)` |
| Planned | `![Planned](https://img.shields.io/badge/Planned-%23003366)` |
| Approved | `![Approved](https://img.shields.io/badge/Approved-%23665500)` |

### Step 5: Update Overview Table

Append a new row to the table in `docs/roadmap/overview.md`. The row format is:

```
| [<Title>](./features/<kebab-case-name>.md) | <Summary> | ![<Status>](https://img.shields.io/badge/<Status>-<color>) | <issue-link-or-dash> |
```

Column order is: Feature, Description, Status, Issue.

- For the issue column, use `[#N](https://github.com/joggrdocs/code/issues/N)` if an issue exists, otherwise use `-`.
- Insert the new row in the correct status group: Released items first, then Planned, then Approved.

### Step 6: Confirm

After creating the files, display a summary:

- Feature file path
- Overview table updated
- GitHub issue link (if created)

## Reference Files

- **`references/feature-template.md`** — Complete feature file template with correct badge format
