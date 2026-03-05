---
issue: 15
status: Upcoming
---

# Context MCP: External

## Problem

Agents lack a unified way to discover and retrieve relevant external documentation, forcing fragmented lookups across multiple sources and formats that waste tokens and miss critical context.

## What we're releasing

Context MCP: External provides a single aggregation endpoint that indexes public markdown files, `llms.txt`, and XML sitemaps, extracts only the relevant content, and stores it locally so agents can access it through standard filesystem operations.

## Expected outcome

Agents produce higher-quality outputs grounded in up-to-date external documentation, while reducing token overhead and eliminating the need for ad-hoc retrieval logic in every workflow.
