# Develop a Feature

Ship a feature end-to-end: branch, code, test, commit, PR, and merge.

## Prerequisites

- Local environment set up (see [Getting Started](./getting-started.md))
- Familiarity with relevant [standards](../README.md)

## Steps

### 1. Create a branch

Start from an up-to-date `main` branch:

```bash
git checkout main
git pull origin main
git checkout -b feat/my-feature
```

Use Conventional Commits-style branch naming: `feat/`, `fix/`, `docs/`, `refactor/`, `chore/`, etc.

### 2. Make changes

Follow the coding standards:

- `const` only -- no `let`, no mutation
- No classes, loops, or `throw`
- Return `Result` tuples instead of exceptions
- Prefer pure functions, composition, and `es-toolkit` utilities

See the [TypeScript standards](../standards/typescript/coding-style.md) and [error handling standards](../standards/typescript/errors.md) for details.

### 3. Run checks frequently

Run the check suite as you work to catch issues early:

```bash
pnpm lint && pnpm format:check
```

Auto-fix formatting and lint issues:

```bash
pnpm format && pnpm lint:fix
```

### 4. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git commit -m "feat: add new roadmap feature template"
```

Format: `type(scope): description` -- see [Commit Standards](../standards/git-commits.md) for types, scopes, and examples.

Lefthook runs git hooks automatically:

| Hook         | What it does                                         |
| ------------ | ---------------------------------------------------- |
| `commit-msg` | Validates Conventional Commits format via commitlint |
| `pre-commit` | Formats staged files with OXFmt                      |

### 5. Push and open a PR

```bash
git push -u origin feat/my-feature
```

Open a PR against `main`. Use the same `type(scope): description` format for the PR title and include these sections in the description:

```markdown
## Summary

Brief description of changes (2-3 sentences).

## Changes

- Bullet list of specific changes

## Testing

1. Step-by-step testing instructions
2. Expected behavior

## Related Issues

Closes #123
```

See [Pull Request Standards](../standards/git-pulls.md) for the full review and merge process.

### 6. Address review feedback

Respond to review comments within 24 hours. Make fixup commits and push:

```bash
git commit -m "fix: address review feedback"
git push
```

### 7. Merge

After approval and green CI, use **Squash and Merge**.

## Verification

Before requesting review, confirm:

1. `pnpm lint && pnpm format:check` all pass
2. PR title follows `type(scope): description` format

## Troubleshooting

### Pre-push hook fails

**Issue:** `git push` is blocked by lint errors.

**Fix:**

```bash
pnpm lint:fix && pnpm format
```

Fix any remaining errors, then re-push.

### Merge conflicts

**Issue:** PR cannot be merged due to conflicts with `main`.

**Fix:**

```bash
git fetch origin
git rebase origin/main
# Resolve conflicts
git push --force-with-lease
```

## References

- [Getting Started](./getting-started.md)
- [Commit Standards](../standards/git-commits.md)
- [Pull Request Standards](../standards/git-pulls.md)
- [Coding Style](../standards/typescript/coding-style.md)
- [Errors](../standards/typescript/errors.md)
