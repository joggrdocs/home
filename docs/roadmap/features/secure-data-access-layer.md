---
issue: 30
status: Upcoming
productArea:
  - 🔌 context-integration
---

# Secure MCP Access Controls (unmcp)

## Problem

When agents connect directly to systems like GitHub, Jira, or Linear through MCP integrations, they inherit the full permissions of the connected account. This can unintentionally give agents the ability to modify or delete sensitive resources.

## What we're releasing

We’re integrating unMCP, a CLI tool that introduces a controlled layer between agents and MCP-connected systems. Instead of giving agents unrestricted access through MCP, unMCP enforces scoped permissions so agents can only access approved resources and perform explicitly allowed actions.

## Expected outcome

Teams can safely connect agents to tools like GitHub and Jira/Linear without exposing the full privileges of those systems, enabling secure automation while reducing the risk of unintended or destructive operations.
