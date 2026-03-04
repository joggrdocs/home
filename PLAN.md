# Repository Setup Plan

> Internal planning document for setting up `joggrdocs/code` as the public hub for Joggr.

## Goal

Create a polished, code-driven public repository that serves as the central hub for Joggr — documentation, roadmap, community engagement, and pointers to all Joggr packages and tools. Modeled after repos like [anthropics/claude-code](https://github.com/anthropics/claude-code) and mirrors the code-driven management patterns from our internal Serenity monorepo.

---

## Phase 1: Repository Foundation

- [x] Create private GitHub repo (`joggrdocs/code`)
- [x] Add git remote
- [x] `LICENSE.md` — Proprietary (© Joggr, Inc., links to Joggr Commercial ToS)
- [x] `.gitignore` — OS files, editor files, node_modules, env files
- [x] `CODEOWNERS` — Default ownership to @zacrosenbauer

## Phase 2: Community Health Files

- [ ] `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
- [ ] `CONTRIBUTING.md` — How to engage (file issues, discussions, contribute docs)
- [ ] `SECURITY.md` — Vulnerability reporting policy (similar to Claude Code's)

## Phase 3: The README

- [ ] `README.md` — The showpiece
  - Header with Joggr branding (logo/banner or clean text header)
  - Tagline: "Knowledge base built for devs and agents"
  - Badge row (license, GitHub stars, discussions)
  - "What is Joggr?" section
  - Products & packages table linking to all Joggr repos
    - [kidd](https://github.com/joggrdocs/kidd) — CLI framework
    - [tempo](https://github.com/joggrdocs/tempo) — Markdown document builder
    - [fastify-prisma](https://github.com/joggrdocs/fastify-prisma) — Fastify Prisma plugin
    - _(add more as they go public)_
  - Community section (discussions, contributing, support)
  - Footer with legal links

## Phase 4: Code-Driven GitHub Config

### Labels (`.github/labels.json`)

Declarative label definitions synced to GitHub via workflow:

| Category | Labels | Color |
|----------|--------|-------|
| Type | `bug`, `enhancement`, `documentation`, `question` | GitHub defaults |
| Status | `status:triage`, `status:accepted`, `status:in-progress`, `status:blocked` | Grays/Blues/Red |
| Priority | `priority:critical`, `priority:high`, `priority:medium`, `priority:low` | Red → Green gradient |
| Product | `product:console`, `product:api`, `product:integrations`, `product:mcp`, `product:cli`, `product:sdk` | Blue/Purple |
| Community | `good first issue`, `help wanted`, `duplicate`, `invalid`, `wontfix` | GitHub defaults |

### Issue Templates

- [ ] `.github/ISSUE_TEMPLATE/config.yml` — Template chooser (links questions → Discussions)
- [ ] `.github/ISSUE_TEMPLATE/bug-report.yml` — YAML form-based bug report
- [ ] `.github/ISSUE_TEMPLATE/feature-request.yml` — YAML form-based feature request
- [ ] `.github/ISSUE_TEMPLATE/documentation.yml` — Docs improvement request

### Discussion Templates

- [ ] `.github/DISCUSSION_TEMPLATE/ideas.yml` — Feature ideas and proposals
- [ ] `.github/DISCUSSION_TEMPLATE/q-and-a.yml` — Questions and support

### PR Template

- [ ] `.github/pull_request_template.md` — Mirrors Serenity format (Summary, Motivation, Key Changes, Testing, Notes)

### Auto-Labeler

- [ ] `.github/labeler.yaml` — File path → label mapping rules
- [ ] `.github/workflows/auto-labeler.yaml` — `actions/labeler@v6` on PRs

## Phase 5: Automation Workflows

- [ ] `.github/workflows/label-sync.yaml` — Syncs `labels.json` to repo on push to main (uses `EndBug/label-sync` or GitHub API)
- [ ] `.github/workflows/stale.yaml` — Auto-label and close stale issues/PRs after configurable period
- [ ] `.github/workflows/welcome.yaml` — Greet first-time contributors (optional)

## Phase 6: Commit & Code Quality

- [ ] `package.json` — Minimal, devDeps only (commitlint, lefthook)
- [ ] `commit-conventions.json` — Allowed commit types and scopes
- [ ] `commitlint.config.ts` — Extends `@commitlint/config-conventional` with custom rules
- [ ] `lefthook.yml` — Git hooks (commit-msg → commitlint)

## Phase 7: Finalize

- [ ] Initial commit and push to remote
- [ ] Enable GitHub Discussions on the repo
- [ ] Set repo topics (e.g. `documentation`, `developer-tools`, `knowledge-base`, `ai-agents`)
- [ ] Flip to public when ready

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| License | Proprietary (© Joggr, Inc.) | Mirrors Claude Code — public hub, not OSS distribution |
| Visibility | Private first, flip to public when ready | User preference |
| Label management | `.github/labels.json` + sync workflow | Code-driven, matches Serenity pattern |
| Commit enforcement | Commitlint + Lefthook | Mirrors Serenity setup |
| Issue templates | YAML form-based | Modern GitHub experience, structured data |

## Open Questions

- [ ] Joggr logo/banner asset URL for README header (text-only fallback for now)
- [ ] Additional public packages to link from README
- [ ] Specific GitHub Discussion categories to enable
- [ ] Additional CODEOWNERS entries (other team members)
