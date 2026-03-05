# GG Workspaces: Containers

**Status:** ![Approved](https://img.shields.io/badge/Approved-%23006B3F)

## Summary

Runs AI agents inside isolated local containers for safer execution.

## Problem

Running AI agents directly on a developer's local machine poses security and stability risks, as unchecked agent actions can modify system files, install unexpected dependencies, or interfere with the host environment.

## Solution

GG Workspaces: Containers wraps each AI agent session in an isolated local container, sandboxing file system access and process execution so that agent activity cannot affect the host system.

## Impact

Developers can confidently run AI coding agents knowing their local environment is protected, reducing risk and enabling broader adoption of agentic workflows across teams.
