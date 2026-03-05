# Feature File Template

Use this exact format when creating new roadmap feature files at `docs/roadmap/features/<kebab-case-name>.md`.

## Template

```markdown
---
status: <Status>
issue: <issue number or empty>
---

# <Title>

## Problem

<What limitation, gap, or pain point this feature addresses.>

## What we're releasing

<How the feature solves the problem — the approach or architecture.>

## Expected outcome

<What users gain — the concrete benefit or outcome.>
```

## YAML Frontmatter

Every feature file starts with YAML frontmatter containing:

| Field | Required | Description |
|-------|----------|-------------|
| `status` | Yes | Current status — must match a value from `scripts/conf/project.json` |
| `issue` | No | GitHub issue number (leave empty if none) |

## Status Badges

Status badge colors follow a darkwave/synthwave palette. Use these exact badge URLs based on feature status:

### Idea (electric purple)

```
![Idea](https://img.shields.io/badge/Idea-%238a04ed)
```

### Planned (imperial blue)

```
![Planned](https://img.shields.io/badge/Planned-%230C1565)
```

### In progress (burnt orange)

```
![In progress](https://img.shields.io/badge/In%20progress-%23e85d04)
```

### Released (dark teal)

```
![Released](https://img.shields.io/badge/Released-%2300a67e)
```

## Example: Agent Harness

```markdown
---
status: Planned
issue:
---

# Agent Harness

## Problem

In the first release, the Coding Agent Setup Doctor used a single agent to spot-check repositories for AI development setup issues, which limited the depth and consistency of findings.

## What we're releasing

Agent Harness introduces a coordinated agentic loop—similar to architectures used by Claude Code, Codex, and other coding agent platforms—allowing multiple specialized sub-agents to analyze repositories more thoroughly and validate findings collaboratively.

## Expected outcome

Users receive significantly more comprehensive and accurate setup diagnostics, with a system designed to continuously improve over time and serve as the foundation for reliable AI coding workflows.
```

## Filename Convention

Convert the feature title to kebab-case:

1. Lowercase all characters
2. Replace spaces with hyphens
3. Remove special characters (parentheses, colons, etc.)
4. Collapse multiple hyphens into one

Examples:

| Title | Filename |
|-------|----------|
| Agent Harness | `agent-harness.md` |
| Coding Agent Setup Doctor | `coding-agent-setup-doctor.md` |
| GG Workflow | `gg-workflow.md` |
| Coding Agent Toolkit MCP (Serena) | `coding-agent-toolkit-mcp.md` |
| Secure Data Access Layer (unmcp) | `secure-data-access-layer.md` |

## Overview Table Row Format

```
| [<Title>](./features/<filename>) | <Summary> | ![<Status>](https://img.shields.io/badge/<Status>-<color>) | <issue> |
```

Where `<issue>` is either:
- `[#N](https://github.com/joggrdocs/home/issues/N)` — linked GitHub issue
- `-` — no issue yet

For `In progress` in badge URLs, encode the space: `In%20progress`.
