---
status: Planned
issue: 8
productArea:
  - 🔧 agent-setup
---

# Coding Agent Setup PR Check

## Problem

Agent configuration and instruction files can silently become outdated or broken as a codebase evolves, and these issues often go unnoticed until they cause incorrect AI behavior in production workflows.

## What we're releasing

The PR Check runs automatically on every pull request to validate agent configs and instruction files, flagging any that are outdated or misconfigured before they are merged.

## Expected outcome

Teams catch AI development setup regressions early in the development cycle, preventing broken agent configurations from reaching the main branch and disrupting AI-assisted workflows.
