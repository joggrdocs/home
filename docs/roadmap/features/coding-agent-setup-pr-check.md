# Coding Agent Setup PR Check

**Status:** ![Planned](https://img.shields.io/badge/Planned-%23003366)

## Summary

Detect and flag outdated/misconfigured agent configs and instruction files on every pull request.

## Problem

Agent configuration and instruction files can silently become outdated or broken as a codebase evolves, and these issues often go unnoticed until they cause incorrect AI behavior in production workflows.

## Solution

The PR Check runs automatically on every pull request to validate agent configs and instruction files, flagging any that are outdated or misconfigured before they are merged.

## Impact

Teams catch AI development setup regressions early in the development cycle, preventing broken agent configurations from reaching the main branch and disrupting AI-assisted workflows.
