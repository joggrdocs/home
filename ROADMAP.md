# Product Roadmap

## Released

- **Coding Agent Setup Doctor** — Analyzes a repository for misconfigured AI development setup, including poorly written/outdated instruction files and incorrect/unsafe tool configurations required by AI coding agents.

## Planned

- **Agent Harness** — Sub-agent orchestration setup using the same agentic loop architecture as Claude Code, Codex, OpenCode and other coding agent platforms.
- **Coding Agent Setup Remediation** — Auto-generate fixes that apply recommended fixes from doctor findings, that can be applied in a pull request.
- **Coding Agent Setup CLI** — Guides users through reviewing their current and establishing their (harden existing) AI development setup, generating initial versions of files such as `CLAUDE.md`, `AGENTS.md`, and `.claude/settings.json` based on detected tools and repository context.
- **Coding Standards Generation** — Generate a codebase-aware set of standards docs based on detected patterns and conventions, and include in the AI instructions and rules as needed.
- **Coding Standards Rules** — Generate and update rules & update instruction files that guide agents to follow coding standards documentation.
- **GG Workflow** — A structured workflow for developing with AI (discuss → research → plan → execute → verify), built using Agent Skills and a custom CLI.
- **GG Plan Review** — Web UI for viewing, annotating, and approving GG workflow plans, that can be securely shared with your teammates.
- **GG Workspace Management** — Create and manage workspaces (git worktrees, in future devcontainer/sandbox) scoped to GG workflow runs that allow you to work on multiple issues at once (i.e. multiple branches on the same repository).
- **GG Local Code Review** — Web UI for viewing, annotating, and approving GG generated code locally and providing that feedback directly back to the agent to fix.
- **Coding Agent Setup PR Check** — Detect and flag outdated/misconfigured agent configs and instruction files on every pull request.
- **Coding Standards PR Check** — Detect stale coding standards docs and related coding standards rules on every pull request.

## Approved

- **GG Git Automation** — Automates commits, branch management, and pull request workflows using AI across GG and standalone workflows.
- **Coding Agent Toolkit MCP (Serena)** — MCP server that provides agents with symbol-level code navigation and editing powered by custom agents, models, and algorithms — eliminating the need to read full files or rely on text-based search for faster, more precise, and token-efficient operations across the codebase.
- **Secure Data Access Layer (unmcp)** — Replaces direct MCP integrations with scoped, permission-bound access to external systems, ensuring agents can only read and write resources they are explicitly authorized for.
- **Coding Agent Statusline** — Displays repository state and AI session context in a terminal status bar, including GG workflow state, optimized for Claude Code and other terminal-based coding agents.
- **Context MCP: External** — MCP server that aggregates external documentation sources including public markdown files, `llms.txt`, and XML sitemaps into a single search and retrieval endpoint, extracting only the relevant context agents need and storing retrieved context locally for agent access via standard filesystem operations.
- **Safe Package Resolution** — Intercepts agent package install requests and validates candidates against maintenance status, security advisories, and download activity before allowing installation — preventing agents from pulling in abandoned, vulnerable, or mismatched packages.
- **Coding Agent Quality Checks** — Automatically installs and maintains Coding Agent (Claude Code) hooks that run linting, formatting, and CLI-based validation on any code an agent touches, ensuring agent-generated code meets the same quality gates as human-written code.
- **GG Workspaces: Containers** — Runs AI agents inside isolated local containers for safer execution.
- **Agents & Skills Registry: Global** — A set of prebuilt and Joggr-verified agents and reusable skills installable via the AI Dev Setup CLI, scoped to repository needs.
- **Documentation Doctor: Missing** — Detects missing or incomplete core documentation such as READMEs, setup guides, and API docs.
- **Documentation Doctor: Drift** — Identifies documentation that is outdated or inconsistent with the current codebase.
- **Vibepress Setup** — Generates a documentation website directly from repository markdown based on their current documentation architecture.
- **Documentation Doctor: Advanced** — Detects missing or outdated advanced documentation types covering system architecture, service boundaries, data flows, and cross-system workflows.
- **Vibepress Doctor** — Audits existing Vibepress configuration, patches gaps, removes stale content, and manages ongoing maintenance end to end.
- **Context MCP: Internal** — Aggregates repository structure, documentation, and project metadata into structured context for agents.
- **GG Workspaces: Remote** — Runs AI agents inside isolated remote sandboxes for safer and completely autonomous execution.
- **GG Agent Loop** — Runs autonomous coding agents independently in a remote environment by looping over instructions set by a human operator.
- **Vibepress Publish** — Provides a published and authenticated (via Joggr or SAML) internal documentation platform accessible by engineers and AI agents via `llms.txt` and `.md` protocol.
- **Agents & Skills Registry: Private** — A private hosted registry of skills searchable and accessible by humans and coding agents, custom to the enterprise, used to limit maintenance, enforce security, and understand distribution and usage across the enterprise.
- **Joggr Code** — A full coding agent using all the above.
