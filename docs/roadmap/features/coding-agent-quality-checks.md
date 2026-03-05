# Coding Agent Quality Checks

**Status:** ![Approved](https://img.shields.io/badge/Approved-%23006B3F)

## Summary

Automatically installs and maintains Coding Agent (Claude Code) hooks that run linting, formatting, and CLI-based validation on any code an agent touches, ensuring agent-generated code meets the same quality gates as human-written code.

## Problem

AI coding agents can generate code that bypasses a project's established linting, formatting, and validation rules, introducing inconsistencies and quality regressions that are costly to catch in review.

## Solution

Coding Agent Quality Checks automatically installs and maintains hooks that run the project's full suite of linting, formatting, and CLI-based validation on every piece of agent-generated code before it is committed.

## Impact

Teams can trust that agent-generated code consistently meets the same quality standards as human-written code, reducing review burden and preventing quality regressions from entering the codebase.
