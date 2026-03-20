# Git Workflow

## Rules

1. **All development must happen on a worktree + separate branch** — never commit directly on main
2. **main only accepts squash merge** — one PR = one commit, no merge bubbles
3. **PR creation and merge are separate steps** — merge requires explicit user approval
4. **Commit messages in English** — follow conventional commits format
5. **No Co-Authored-By or AI attribution lines**
6. **Audit staged content before every commit** — run `git diff --cached --stat` to confirm only current-task changes are staged. Do not mix in other people's uncommitted changes

## Branch Naming

| Prefix            | Purpose     |
| ----------------- | ----------- |
| `feat/<name>`     | New feature |
| `fix/<name>`      | Bug fix     |
| `chore/<name>`    | Maintenance |
| `refactor/<name>` | Refactor    |

## Worktree Directory

- Path: `.worktrees/<branch-name>` (already in `.gitignore`)
- Each worktree has its own `.env` for port/path isolation
- Shared functions go in `/src/shared/` to reduce cross-branch conflicts
- To run a branch in Docker for testing, use `./scripts/preview start <branch>` — see [preview-cli.md](preview-cli.md)

### Worktree Setup

After creating a worktree, initialize it with **npm** (never pnpm — the project uses npm):

```bash
cd .worktrees/<branch-name>
npm ci
```

If `better-sqlite3` bindings are missing (test error: "Could not locate the bindings file"), run:

```bash
npm rebuild better-sqlite3
```

Using `pnpm install` creates an incompatible non-hoisted `.pnpm/` layout that breaks
native module resolution and produces spurious test failures unrelated to your changes.

## Commit Convention

- Format: `type: short description` (e.g. `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`)
- English only, no Chinese or other non-ASCII characters
- No `Co-Authored-By` lines or AI generation disclaimers

## Issue Linking

- Every PR **must** reference at least one issue in its body
- Use `Closes #N` when the PR fully resolves an issue (GitHub auto-closes it on merge)
- Use `Part of #N` when the PR is incremental progress toward a larger issue
- For large issues: split into sub-issues with a tracking issue using task lists, or use `Part of` for intermediate PRs
- Use `Closes` (not `Fixes` or `Resolves`) for consistency
- CI enforces this — PRs without `Closes #N` or `Part of #N` will fail the check

## Merge Flow

```bash
# Create PR (include "Closes #N" in the body)
gh pr create --title "feat: add feature X" --body "Closes #123"

# Merge only after user confirms (squash only)
gh pr merge --squash
```
