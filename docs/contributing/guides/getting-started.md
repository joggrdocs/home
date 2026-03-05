# Get Started Contributing

Set up your local environment to contribute to Joggr Code.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) 10.x (`corepack enable` to activate)
- [Git](https://git-scm.com/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (optional but recommended)

## Steps

### 1. Fork and clone

```bash
gh repo fork joggr/code --clone
cd code
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Verify the build

Run the full check suite to confirm everything works:

```bash
pnpm lint && pnpm format:check
```

### 4. Understand the project

Read the project docs in this order:

1. [`CLAUDE.md`](../../../CLAUDE.md) -- tech stack, project structure, available commands
2. Relevant standards in [`standards/`](../standards/) as needed

### 5. Set up Claude Code (optional)

The repo includes built-in configuration for Claude Code:

| File                             | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `CLAUDE.md`                      | Persona, project structure, tech stack, and commands             |
| `.claude/rules/typescript.md`    | Functional programming rules Claude follows for TypeScript files |
| `.claude/rules/documentation.md` | Documentation standards Claude follows for markdown files        |

## Verification

Confirm all checks pass:

```bash
pnpm lint && pnpm format:check
```

## Troubleshooting

### pnpm not found

**Issue:** Running `pnpm` returns "command not found."

**Fix:**

```bash
corepack enable
```

### Lockfile mismatch after switching branches

**Issue:** Build or install fails after checking out a different branch.

**Fix:**

```bash
pnpm install
```

### Lefthook hooks fail on commit or push

**Issue:** Git hooks block your commit or push with lint/format errors.

**Fix:** Fix the reported issues and re-commit. The hooks run automatically via [Lefthook](https://github.com/evilmartians/lefthook) -- see `.config/lefthook.yml` for the full hook configuration.

## References

- [CLAUDE.md](../../../CLAUDE.md)
