# Context MCP: External

**Status:** ![Approved](https://img.shields.io/badge/Approved-%23006B3F)

## Summary

MCP server that aggregates external documentation sources including public markdown files, `llms.txt`, and XML sitemaps into a single search and retrieval endpoint, extracting only the relevant context agents need and storing retrieved context locally for agent access via standard filesystem operations.

## Problem

Agents lack a unified way to discover and retrieve relevant external documentation, forcing fragmented lookups across multiple sources and formats that waste tokens and miss critical context.

## Solution

Context MCP: External provides a single aggregation endpoint that indexes public markdown files, `llms.txt`, and XML sitemaps, extracts only the relevant content, and stores it locally so agents can access it through standard filesystem operations.

## Impact

Agents produce higher-quality outputs grounded in up-to-date external documentation, while reducing token overhead and eliminating the need for ad-hoc retrieval logic in every workflow.
