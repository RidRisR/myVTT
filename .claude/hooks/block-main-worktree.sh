#!/bin/bash
# Block Edit/Write to files in the main worktree.
# All development must happen in an isolated git worktree.

FILE=$(cat | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

# Get the main worktree root
MAIN_WORKTREE=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')

if [ -z "$MAIN_WORKTREE" ]; then
  exit 0
fi

# Allow files outside the main worktree (sibling worktrees, ~/.claude/plans/, etc.)
case "$FILE" in
  "$MAIN_WORKTREE"/*)
    ;; # File is inside main worktree, continue checking
  *)
    exit 0 ;; # File is outside main worktree, allow
esac

# Allow .worktrees/ subdirectory
case "$FILE" in
  "$MAIN_WORKTREE/.worktrees/"*)
    exit 0 ;;
esac

# Allow .claude/ directory (config files, not source code)
case "$FILE" in
  "$MAIN_WORKTREE/.claude/"*)
    exit 0 ;;
esac

echo '{"decision":"block","reason":"Main worktree edit blocked.","additionalContext":"STOP. Re-read CLAUDE.md. Create a worktree with: git worktree add .worktrees/<name> -b <branch>, then edit files there."}'
exit 0
