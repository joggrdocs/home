<div align="center">

<img src="./workspaces.svg" alt="Workspaces Banner" width="100%" />

</div>

# Workspaces

## Overview

Workspaces are fully isolated, pre-configured development environments built for the age of agentic coding. They go far beyond worktrees or containers. A Workspace is the complete, turnkey setup your developers and agents need to work safely and productively, without any manual wiring or ongoing maintenance.

The core idea is simple: you shouldn't have to spend engineering time building and maintaining a secure dev environment for agents. Workspaces handle isolation, networking, auditing, tooling, and deployment out of the box so your team ships faster, your agents operate safely, and your security team has full visibility. All without any of it getting in the developer's way.

Whether you're an individual developer running agents locally or an enterprise team with strict compliance requirements running on your own hardware, Workspaces scale to fit, and the security is always on by default.

## Features

### Environment & Isolation

- **Full container/pod isolation** - each Workspace runs in its own sandboxed environment, completely separate from your host machine and other Workspaces
- **Local sandbox deployment** - run and test code inside the Workspace without any manual setup or external deployment targets
- **Authenticated preview URLs** - each Workspace can expose authenticated URLs for testing frontends, APIs, and services running inside the environment
- **Automated setup** - each Workspace automatically runs your setup steps on creation (dependency installs, database migrations, seed data, file copies) so it's ready to use immediately
- **Clean environment per session** - no state bleeds between Workspaces; every environment starts from a known, reproducible baseline
- **Blast radius containment** - if an agent misbehaves or a dependency is compromised, the damage is contained to that Workspace and can't spread
- **Configurable lifecycle** - Workspaces are ephemeral by default, but can be configured for persistence, session restore, or automatic reboot on failure

### Security & Network Controls

- **Prebuilt network controls** - network access is locked down by default; no outbound calls are made unless explicitly allowed
- **Team-managed domain allowlists** - teams can pre-approve specific domains their agents are permitted to reach
- **Platform pre-approved list** - a curated set of safe, commonly needed domains is included out of the box
- **Full autonomy mode** - let agents operate with broad permissions inside the Workspace without exposing your systems or the broader internet to unintended calls
- **Full machine-level audit logging** - every action taken inside a Workspace is logged at the infrastructure layer, always on, with no developer instrumentation required
- **Credential & secret isolation** - environment variables and secrets are scoped to their Workspace and cannot leak across environments or be accessed by parallel agents

### Access & Tooling

- **VS Code extension** - create, manage, and connect to Workspaces directly from your editor
- **Joggr app & web console** - manage and access Workspaces from the native Joggr application or web console
- **Native, pre-wired tooling** - editors, terminals, language servers, and deployment targets are configured to work together from day one
- **No glue code** - you don't have to wire your sandbox to your container to your repo; it's already connected
- **Language and stack agnostic** - Workspaces support any language, framework, or monorepo structure
- **Long-term platform maintenance** - integrations are maintained by the platform, not your team; no keeping up with upstream changes or broken setups after upgrades

### Infrastructure as Code

- **Workspace configuration as code** - define Workspace templates, resource limits, network policies, and tooling in version-controlled configuration files
- **Reproducible environments** - every Workspace is created from a declared configuration, eliminating drift and snowflake setups
- **Team and role management** - access controls and Workspace policies are defined in code and managed through a centralized console

### Enterprise & Self-Hosted

- **Run on your own hardware** - enterprise teams can deploy Workspaces on their own infrastructure, not a shared cloud environment
- **Data residency control** - keep all code, secrets, and agent activity within your own network boundary
- **Compliance-ready by default** - audit logs, network controls, and isolation are all in place without requiring custom security configuration
- **Configurable resource limits** - CPU, memory, and disk are configurable per Workspace to match workload requirements
- **Centralized console** - manage Workspaces, policies, and access across your organization from a single control plane

### Agent-Specific Capabilities

- **Designed for concurrent agents** - run multiple agents in parallel Workspaces with full isolation between them; no cross-contamination of state or credentials
- **Agent action auditing** - know exactly what every agent did, in which Workspace, and when; critical for debugging, compliance, and trust
- **Controlled autonomy** - agents can be given broad permissions to operate freely within a Workspace while remaining completely contained by the environment's security controls
- **Reproducible agent environments** - every agent run starts from the same baseline, making agent behavior consistent and debuggable

---

## FAQ

### How are Workspaces different from `--worktree` or existing worktree managers?

Worktree managers solve one specific problem: giving you multiple working copies of a repo. Workspaces go much further.

A Workspace isn't just a worktree. It's a fully isolated, pre-configured development environment with container/pod isolation, local sandbox deployment, native tooling integration, and security built in by default. Worktree tools give you a directory. Workspaces give you a full, reproducible dev environment ready for agents to work in, securely, from day one.

### Does adding security controls mean a worse developer experience?

No, and this is the core design principle behind Workspaces.

Security is built into the environment itself, not bolted on top of the developer's workflow. Network controls, action auditing, and isolation are on by default and handled by the platform. Developers and agents get full autonomy within the sandbox because the guardrails are at the infrastructure level, not in their way.

The result: devs get the speed and freedom they want. Security teams get the controls and visibility they need. Neither side has to compromise.

### Can I run agents in Workspaces without worrying about unsafe network calls?

Yes. Network access is controlled at the Workspace level:

- **Team-managed domain allowlists** - only traffic to approved domains is permitted
- **Platform pre-approved list** - sensible defaults are included out of the box
- **Deny by default** - everything outside the allowlist is blocked

This means you can give agents broad autonomy without exposing your systems or the internet to unintended calls. Permissive agent behavior, safe by design.

### How does Workspaces help with security auditing and compliance?

Every action taken inside a Workspace is logged at the machine level. You get a full audit trail of what any agent or developer did, when, and in which Workspace. Because everything runs inside the Workspace environment, there's no activity outside the audit boundary. Developers never have to think about this; logging happens at the infrastructure layer and is always on.

### How are secrets provisioned into a Workspace?

Secrets and credentials are injected into the Workspace environment at creation time, scoped to that Workspace only. They cannot leak across environments or be accessed by parallel agents. Secret provisioning is configured as part of the Workspace definition in code.

### What happens when a Workspace crashes or an agent hangs?

Workspaces handle failures based on your configuration. Options include automatic reboot, session restore to resume from the last known state, or clean restart from the baseline. The specific behavior is defined in your Workspace configuration.

### How do I manage Workspace access across teams and roles?

Through a combination of infrastructure as code and a centralized console. Workspace policies, access controls, and role assignments are defined in version-controlled configuration files and managed through the console for visibility and oversight.

### Why not just set this up myself with Docker, scripts, and a worktree manager?

You can, but then you own it forever.

Rolling your own setup means building and maintaining isolation, networking, sandboxing, auditing, tooling integration, and deployment pipelines. Every time your stack evolves, every time agent behavior changes, every time a new developer joins, you're on the hook.

More importantly, DIY setups rarely get security right consistently. Network controls get misconfigured. Audit logging gets skipped. Credential scoping gets overlooked. Not because teams are careless, but because it's genuinely hard to get right at the infrastructure level.

Workspaces handle all of this as a turnkey, actively maintained solution so you get a well-built, secure agent dev environment without the ongoing engineering and security overhead.

### Does this work for enterprise teams with strict infrastructure requirements?

Yes. Enterprise teams can run Workspaces on their own hardware with full data residency control. Audit logs, network controls, isolation, and resource limits are all configurable, meeting your security and compliance requirements while providing the full Workspaces experience.

### What does "natively integrated tooling" mean in practice?

It means the tools your agents need (editors, terminals, language servers, deployment targets, network controls, and audit logging) are built into the Workspace and configured to work together from day one. You don't need to figure out how to make your sandbox talk to your container talk to your repo. It's already done, and it's already secure.
