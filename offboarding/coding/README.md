# Offboarding the Joggr coding tooling

Remove the Joggr CLI, the Claude Code hook, and any per-machine state Joggr installed under `~/.claude/`. Either run the script (Option 1) or follow the manual steps (Option 2).

**Requires** Node 20+ on macOS or Linux.

The script is happy-path only. If anything unexpected comes up (settings file already edited, name conflict, etc.) it fails loud and points back here — use Option 2 to recover.

## Option 1 — Run the script

```bash
curl -fsSL https://raw.githubusercontent.com/joggrdocs/home/main/offboarding/coding/install.sh | bash
cd joggr-offboarding
npm run offboard    # interactive
npm run status      # verify it's gone
```

To undo: `npm run restore`. To commit to it: `rm -rf ~/.joggr-offboard-backup/`.

The script **moves** (not deletes) your `settings.json` and any `gg-*` skills/agents into `~/.joggr-offboard-backup/`. Nothing is permanently gone until you wipe that directory yourself. The CLI uninstall is **not** reversible — reinstall manually if needed:

```bash
npm install -g @joggr/cli       # or: pnpm add -g @joggr/cli  /  bun add -g @joggr/cli
```

`npm run offboard --yes` auto-confirms every prompt (useful for CI).

## Option 2 — Manual

> **PERMANENT DELETE — NOT REVERSIBLE.** These commands delete files outright. Use Option 1 if you might want to undo.

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

### 4. Remove repo state

In each repo where you ran `jog init`, `rm -rf .joggr/`. To find them all: `find ~/Code -name .joggr -type d -not -path '*/node_modules/*' 2>/dev/null`.

## License

Use is subject to Joggr's [Commercial Terms of Service](https://www.joggr.io/legal/terms).

## Questions

Reach out to the founding team in Slack.
