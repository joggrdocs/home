---
issue: 15
status: Upcoming
productArea:
  - 🔌 context-integration
---
# Instant Access to External Docs for Agents

## Problem

Agents often need to reference external documentation (framework docs, APIs, product guides), but there’s no consistent way for them to discover and retrieve it. Instead, they rely on ad-hoc web lookups or manual retrieval logic, which wastes tokens, slows workflows, and often misses relevant context.

## What we're releasing

Context MCP: External aggregates external documentation sources—such as public markdown repositories, llms.txt, and documentation sites exposed through XML sitemaps—and indexes them locally. Agents can then retrieve the relevant content directly from this local index using standard filesystem operations, without needing custom retrieval logic or repeated web requests.

## Expected outcome

Agents can quickly access the right external documentation while using fewer tokens, producing more accurate outputs and eliminating the need to build custom documentation retrieval into every workflow.