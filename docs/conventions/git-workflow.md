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

## Commit Convention

- Format: `type: short description` (e.g. `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`)
- English only, no Chinese or other non-ASCII characters
- No `Co-Authored-By` lines or AI generation disclaimers

## Merge Flow

```bash
# Create PR
gh pr create --title "feat: add feature X" --body "..."

# Merge only after user confirms (squash only)
gh pr merge --squash
```
