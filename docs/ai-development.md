# How you code has changed

When teams start using tools like Claude or Cursor, the initial experience feels incredible. Features that used to take hours can be scaffolded in minutes.

But very quickly, something shifts in how you work... you spend most of your time trying to either: 

- help the LLM by planning & feeding it context
- fixing the LLMs outputs because of bugs or poorly written code

![What AI Coding is Really like](./.assets/reviews.png)

## The Bottleneck Has Moved

The bottleneck is ~~writing~~ planning & reviewing code. As a dev the majority of your time is now spent:

- **Upstream** — planning and designing the feature
- **Downstream** — reviewing, validating, and integrating the generated code

While AI tools are great at generating code, they don't give you a system for handling the parts of the workflow where most of your time is spent.

## What Breaks as You Scale

To make AI coding work reliably, you end up building and maintaining a surprising amount of infrastructure.

### Planning and Context

- **Work breakdown** — You have to manually decompose features into steps and decide what code, docs, and prior decisions to feed into each step. This becomes especially painful for long, complex features where the model loses context or makes incorrect assumptions.

- **Agent memory** — Instruction files only go so far. In practice, you're constantly "teaching" the model: stop using X, we use Y now. That means creating docs, updating rules, and modifying instruction files every time decisions change — and none of it transfers across tools or scales across a team.

<details>
<summary>How Joggr solves this</summary>

- [GG Workflow](https://github.com/joggrdocs/home/issues/24) — a structured workflow for planning, executing, and reviewing AI-driven features
- [Context MCP: Internal](https://github.com/joggrdocs/home/issues/16) — aggregates repo structure, docs, and project metadata into structured context for agents
- [Context MCP: External](https://github.com/joggrdocs/home/issues/15) — aggregates external documentation sources into a single search endpoint

</details>

### Codebase Understanding

- **Documentation** — Architecture and system docs must stay current so the model understands how your codebase works.

- **Instruction files** — Repo-wide and subdirectory-level rules must be defined and maintained as the codebase evolves.

- **Coding standards** — How code should be written must be encoded and kept consistent with your repo.

<details>
<summary>How Joggr solves this</summary>

- [Coding Standards Generation](https://github.com/joggrdocs/home/issues/12) — generate codebase-aware standards docs based on detected patterns
- [Coding Standards Rules](https://github.com/joggrdocs/home/issues/14) — generate and update rules that guide agents to follow your standards
- [Coding Agent Setup CLI](https://github.com/joggrdocs/home/issues/6) — guided setup for instruction and config files
- [Documentation Doctor: Missing](https://github.com/joggrdocs/home/issues/19) — detects missing core documentation
- [Documentation Doctor: Drift](https://github.com/joggrdocs/home/issues/18) — identifies docs that are outdated or inconsistent with the codebase

</details>

### Execution and Control

- **Configs and permissions** — You have to configure tools, permissions, and environments — and importantly, *prevent* the model from doing the wrong thing (unsafe commits, unauthorized actions) through hooks and enforcement layers.

- **Agent rules** — Instructions and skills aren't always enough. The model won't reliably follow them, so you need mechanisms to *force* correct behavior — another layer of infrastructure to maintain.

- **Agent environments** — Once agents execute real work (editing files, running commands, interacting with services), you need isolated environments with sandboxing, network controls, credential scoping, and audit logging.

<details>
<summary>How Joggr solves this</summary>

- [Coding Agent Setup Doctor](https://github.com/joggrdocs/home/issues/7) — analyzes repos for misconfigured AI development setup
- [Coding Agent Setup Remediation](https://github.com/joggrdocs/home/issues/9) — auto-generates fixes for doctor findings
- [Coding Agent Quality Checks](https://github.com/joggrdocs/home/issues/5) — installs and maintains hooks that validate agent-touched code
- [Workspaces: Containers](https://github.com/joggrdocs/home/issues/26) — isolated container environments for safer agent execution
- [Secure Data Access Layer](https://github.com/joggrdocs/home/issues/30) — scoped, permission-bound access to external systems

</details>

### Review and Validation

- **Code quality** — Linting, tests, and checks must run, and you spend significant time reviewing and fixing AI-generated code that doesn't follow your standards.

- **Review workflow** — You're constantly jumping between your editor and AI tools, copying context back and forth, coordinating feedback manually. It's a fragmented UX that doesn't scale as AI-generated volume increases.

<details>
<summary>How Joggr solves this</summary>

- [GG Local Code Review](https://github.com/joggrdocs/home/issues/22) — web UI for viewing, annotating, and approving generated code locally
- [GG Plan Review](https://github.com/joggrdocs/home/issues/23) — web UI for viewing, annotating, and approving workflow plans
- [Coding Standards PR Check](https://github.com/joggrdocs/home/issues/13) — detects stale standards docs and rules on every PR
- [Coding Agent Setup PR Check](https://github.com/joggrdocs/home/issues/8) — flags outdated agent configs on every PR

</details>

## This Compounds Over Time

None of this is one-time setup. It all has to stay in sync as your codebase evolves, work together across multiple steps without drifting, and scale across your team.

And if you try to solve it with skills or custom scripts, you hit real constraints:

- You need ~50+ of them for a fully configured repo
- They behave differently across providers (Claude, Cursor, etc.), locking you into a specific tool
- Some parts aren't solvable with skills at all — orchestrating multi-step features or building a usable review workflow requires custom tooling

This is just for a single repo. Scaling across a team means replicating and maintaining this entire system everywhere.

## What This Actually Becomes

At that point, you're not just using AI — you're building and maintaining internal infrastructure to make AI work reliably in your codebase.

This is similar to how teams used to stitch together scripts for testing and deployment before tools like GitHub Actions standardized that layer.

## Where Joggr Fits

Joggr is the context engineering toolkit for developing with AI agents.

It handles the setup, coordination, and ongoing maintenance required to make AI development work — instead of every team building this themselves, Joggr provides it out of the box.
