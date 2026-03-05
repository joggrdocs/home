---
issue: 5
---

# Coding Agent Quality Checks

## Problem

AI coding agents can generate code that bypasses a project's established linting, formatting, and validation rules, introducing inconsistencies and quality regressions that are costly to catch in review.

## What we're releasing

Coding Agent Quality Checks automatically installs and maintains hooks that run the project's full suite of linting, formatting, and CLI-based validation on every piece of agent-generated code before it is committed.

## Expected outcome

Teams can trust that agent-generated code consistently meets the same quality standards as human-written code, reducing review burden and preventing quality regressions from entering the codebase.
