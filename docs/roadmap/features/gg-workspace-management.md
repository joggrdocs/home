---
status: Planned
issue: 25
productArea:
  - 🎮 gg-workflow
---

# GG Workspace Management

## Problem

AI coding tools can move fast enough that developers can kick off work on one feature and let the AI run for a few minutes while starting another. However, managing multiple tasks still requires manually juggling branches and local environments, making it difficult to safely work on features in parallel.

## What we're releasing

GG Workspace Management automatically creates isolated workspaces using git worktrees scoped to each workflow run. This allows developers to work on multiple issues in parallel without branches or environments interfering with each other.

## Expected outcome

Developers can safely run multiple AI-driven workflows at the same time and switch between them instantly, increasing throughput without worrying about branch conflicts or environment contamination.
