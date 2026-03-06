---
issue: 26
status: Upcoming
productArea:
  - 📦 agent-sandbox
  - 🎮 gg-workflow
---
# GG: Run Coding Agents in Secure Containers

## Problem

Running AI agents directly on a developer's local machine poses security and stability risks, as unchecked agent actions can modify system files, install unexpected dependencies, or interfere with the host environment.

## What we're releasing

GG Workspaces: Containers runs each AI agent session inside an isolated local container, sandboxing filesystem access and process execution so agent activity cannot affect the host system.

## Expected outcome

Developers can confidently run AI coding agents knowing their local environment is protected, reducing risk and enabling broader adoption of agentic workflows across teams.
