# Offboarding Joggr Coding

Remove the Joggr CLI, the Claude Code hook, and any per-machine state Joggr installed under `~/.claude/` and `~/.joggr*/`. Your Joggr account, projects on app.joggr.io, and any internal data Joggr holds about your team are out of scope here — contact the team in Slack if you want those deleted.

## Two paths

- **Manual** — follow the [step-by-step instructions](#manual-steps) to remove each piece by hand.
- **Automatic** — run the [Node scripts](#scripts). Quarantines `settings.json` and any `gg-*` skills/agents to a backup directory, attempts the CLI uninstall via npm/pnpm/bun, and ships a `restore.mjs` to undo the reversible parts.

The automatic scripts cover the **happy path only**. If they hit anything unexpected — settings already edited, name conflict in the backup dir, missing binary — they fail and tell you to use the manual steps. There is no recovery logic, no resume, no override flags. The CLI uninstall is not reversible; everything else is.

> [!WARNING]
> The scripts move files in place under `~/.claude/` and `~/.joggr-offboard-backup/`. Provided as-is, run at your own risk. Tested on macOS with Node 20+. Run `node status.mjs` first to see what's installed before mutating anything.

---

## Quick start

If you've already downloaded this directory (via `install.sh` or by cloning the repo) and are in it:

```bash
node status.mjs                 # report what's installed
node offboard.mjs               # interactive cleanup (prompts before each step)
node restore.mjs                # undo the reversible parts
```

`npm run` shortcuts (`npm run status`, `npm run offboard`, `npm run restore`) exist but use the direct `node` form when passing flags — `npm` silently consumes top-level flags unless you use the `--` forwarding syntax.

`node offboard.mjs --yes` auto-confirms every prompt (useful for CI).

---

## What Joggr Coding installs

| Where                                    | What                                                                 | Handled by scripts?                |
| ---------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Global npm/pnpm/bun                      | `@joggr/cli` package providing `jog` and `joggr` binaries             | ✓ uninstall attempted              |
| `~/.claude/settings.json`                | Hook under `hooks.PermissionRequest` invoking `jog`/`joggr`           | ✓ surgically removed               |
| `~/.claude/skills/gg-*/`                 | Joggr-authored Claude Code skills                                    | ✓ moved to backup                  |
| `~/.claude/agents/gg-*/`                 | Joggr-authored Claude Code agents                                    | ✓ moved to backup                  |
| `~/.joggr/`, `~/.joggr-dev/`             | jog CLI's home — auth, sandboxes, reports, **and live git worktrees** | Status reports, manual cleanup     |
| Each repo's `.joggr/`                    | Per-project `config.yaml` + `.gg/` state                              | Status reports, manual cleanup     |
| Each repo's `package.json`               | `@joggr/cli` listed in `dependencies`/`devDependencies`               | Status reports, manual cleanup     |
| app.joggr.io                             | Your projects and team data — these live on Joggr's servers           | Out of scope                       |

**Critically:** the script never deletes worktrees, `.joggr/` directories, or project dependencies — those touch user-managed state where naïve deletion would orphan git worktrees or lose unpushed work. `status.mjs` enumerates each and gives you the exact commands; you decide when to run them.

---

## Download just this directory

If you don't want to clone the whole `joggrdocs/home` repo:

```bash
curl -fsSL https://raw.githubusercontent.com/joggrdocs/home/main/offboarding/coding/install.sh | bash
```

By default it lands at `./joggr-offboarding/`. Override with `OUTPUT=./elsewhere bash install.sh`.

---

## Manual steps

> [!CAUTION]
> Some of these commands delete files outright. Use the [scripts](#scripts) if you might want to undo. The CLI uninstall and the `git worktree remove` calls are not reversible.

### 1. Uninstall the CLI

Run all three — the manager that didn't install the CLI is a no-op:

```bash
npm  uninstall -g @joggr/cli
pnpm rm        -g @joggr/cli
bun  remove    -g @joggr/cli
```

If `jog` is still on PATH (`which jog`), try `brew uninstall @joggr/cli`, `volta uninstall @joggr/cli`, or `asdf uninstall @joggr/cli`.

### 2. Remove the Claude Code hook

Joggr installs one entry in `hooks.PermissionRequest` of `~/.claude/settings.json`:

```json
{
  "matcher": "ExitPlanMode",
  "hooks": [{ "type": "command", "command": "jog app --plan", "timeout": 345600 }]
}
```

Edit `~/.claude/settings.json`. Under `hooks.PermissionRequest`, find the entry with `"matcher": "ExitPlanMode"`. Remove every hook whose `command` invokes `jog` or `joggr` (including absolute paths like `/usr/local/bin/jog`). If the `hooks` array becomes empty, remove the entry itself.

### 3. Delete Joggr skills and agents

```bash
rm -rf ~/.claude/skills/gg-*
rm -rf ~/.claude/agents/gg-*
```

### 4. Remove jog-managed git worktrees

> [!IMPORTANT]
> `~/.joggr/worktrees/` and `~/.joggr-dev/worktrees/` contain **live git worktrees** with their own checked-out branches. Naive `rm -rf` orphans them — refs left dangling in the source repos, and any unpushed work in those branches is lost.

Run `node status.mjs` — it lists every worktree with the exact `git worktree remove` command per source repo. Or do it by hand:

```bash
# For each source repo that has worktrees under ~/.joggr*/, run:
git -C /path/to/source/repo worktree list \
  | grep -E '/.joggr(-dev)?/worktrees/' \
  | awk '{print $1}' \
  | xargs -I{} git -C /path/to/source/repo worktree remove --force '{}'

# When every worktree is gone:
rm -rf ~/.joggr ~/.joggr-dev
```

### 5. Remove per-repo `.joggr/` directories

Per-repo `.joggr/` is just config (`config.yaml` + `.gg/`) — no worktrees inside, safe to delete:

```bash
# Find every per-repo .joggr/ on disk:
find ~/Code -name .joggr -type d -not -path '*/node_modules/*' 2>/dev/null

# Then remove each:
rm -rf /path/to/repo/.joggr
```

### 6. Remove `@joggr/cli` from project dependencies

`status.mjs` lists every `package.json` that still pins `@joggr/cli`. For each:

```bash
pnpm remove @joggr/cli          # or: npm uninstall, bun remove
pnpm install                    # refresh the lockfile
```

Otherwise the next `install` will pull `jog`/`joggr` back into `node_modules/.bin/`.

---

## Scripts

Three zero-dependency Node scripts. Require **Node 20+**.

> [!CAUTION]
> `offboard.mjs` moves your `settings.json` and any `gg-*` skills/agents into `~/.joggr-offboard-backup/` and attempts to uninstall `@joggr/cli` via the package managers it finds on PATH. Run `node status.mjs` first to see what's installed.

### `status.mjs` — what's still there

Read-only. Reports each piece of Joggr state on the machine: CLI on PATH, hook in `settings.json`, `gg-*` skills/agents, project-level `@joggr/cli` dependencies, jog-managed worktrees, and the backup dir. Exit code: `0` if fully offboarded, `1` if anything FAILed.

```bash
node status.mjs
```

The worktree and project-dep checks emit `TODO` lines with the exact commands to run — `status.mjs` never deletes anything itself.

### `offboard.mjs` — interactive cleanup

Prompts before every step. For each available package manager (npm, pnpm, bun), offers to run `<manager> uninstall -g @joggr/cli`. Moves `~/.claude/settings.json` (with the Joggr hook surgically removed) and every `gg-*` entry under `~/.claude/skills/` and `~/.claude/agents/` to `~/.joggr-offboard-backup/`.

```bash
node offboard.mjs               # interactive
node offboard.mjs --yes         # auto-confirm every prompt
```

**The script does not touch:**

- `~/.joggr/` / `~/.joggr-dev/` (live git worktrees — see manual step 4)
- Per-repo `.joggr/` (manual step 5)
- Project `package.json` files (manual step 6)

All three are reported by `status.mjs` so you can clean them up safely.

### `restore.mjs` — undo

Moves `settings.json` and `gg-*` entries back to their original locations. The CLI uninstall is **not** reversible — reinstall manually if needed:

```bash
npm install -g @joggr/cli       # or: pnpm add -g @joggr/cli  /  bun add -g @joggr/cli
```

```bash
node restore.mjs                # interactive
node restore.mjs --yes          # auto-confirm
```

To commit instead of restoring: `rm -rf ~/.joggr-offboard-backup/`.

---

## Layout

```
offboarding/coding/
├── README.md                    you are here
├── package.json                 npm scripts (offboard, status, restore, test)
├── install.sh                   bootstrap: download this dir via curl
├── offboard.mjs                 interactive cleanup
├── status.mjs                   report what's installed (read-only)
├── restore.mjs                  undo offboard.mjs
└── lib/
    ├── constants.mjs            package names, binary names, hook matcher
    ├── utils.mjs                manifest IO, file scanner, git helpers
    └── __tests__/
        ├── utils.test.mjs       unit tests
        └── scripts.test.mjs     integration tests (spawn each script)
```

The backup directory lives at `${HOME}/.joggr-offboard-backup/`. Override with `JOGGR_OFFBOARD_BACKUP_DIR=/some/path` (used for tests).

### Tests

```bash
npm test
```

## License

© Joggr, Inc. All rights reserved. Use is subject to Joggr's [Commercial Terms of Service](https://www.joggr.io/legal/terms). When this directory ships as part of the `joggrdocs/home` repo, the same terms are in [`../LICENSE.md`](../LICENSE.md).

## Questions

Reach out to the founding team directly in Slack.
