# Feature File Template

Use this exact format when creating new roadmap feature files at `docs/roadmap/features/<kebab-case-name>.md`.

## Template

```markdown
# <Title>

**Status:** ![<Status>](https://img.shields.io/badge/<Status>-<color>)

## Summary

<One or two sentences describing what the feature does.>

## Problem

<What limitation, gap, or pain point this feature addresses.>

## Solution

<How the feature solves the problem — the approach or architecture.>

## Impact

<What users gain — the concrete benefit or outcome.>
```

## Status Badges

Use these exact badge URLs based on feature status:

### Released (dark green)

```
![Released](https://img.shields.io/badge/Released-%23006400)
```

### Planned (dark blue)

```
![Planned](https://img.shields.io/badge/Planned-%23003366)
```

### Approved (dark yellow/gold)

```
![Approved](https://img.shields.io/badge/Approved-%23665500)
```

## Example: Agent Harness

```markdown
# Agent Harness

**Status:** ![Planned](https://img.shields.io/badge/Planned-%23003366)

## Summary

Sub-agent orchestration setup for Joggr Agents using the same agentic loop architecture as Claude Code, Codex, OpenCode and other coding agent platforms.

## Problem

In the first release, the Coding Agent Setup Doctor used a single agent to spot-check repositories for AI development setup issues, which limited the depth and consistency of findings.

## Solution

Agent Harness introduces a coordinated agentic loop—similar to architectures used by Claude Code, Codex, and other coding agent platforms—allowing multiple specialized sub-agents to analyze repositories more thoroughly and validate findings collaboratively.

## Impact

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
- `[#N](https://github.com/joggrdocs/code/issues/N)` — linked GitHub issue
- `-` — no issue yet
