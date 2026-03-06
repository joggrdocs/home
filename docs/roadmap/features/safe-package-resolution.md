---
issue: 29
status: Upcoming
productArea:
  - 🔌 context-integration
---
# Safe Dependency Installs for AI Agents

## Problem

AI agents can autonomously install packages without evaluating maintenance health, known vulnerabilities, or ecosystem adoption, introducing abandoned or insecure dependencies into the codebase.

## What we're releasing

Safe Package Resolution intercepts every agent-initiated install request and validates the candidate package against maintenance status, security advisories, and download activity before permitting installation.

## Expected outcome

Teams can trust that agent-driven dependency changes meet the same quality and security bar as human-reviewed additions, preventing supply-chain risks before they enter the codebase.
