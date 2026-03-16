#!/bin/bash
# Block edits to files outside .worktrees/ directory.
# All development must happen in an isolated git worktree.

FILE=$(cat | jq -r '.tool_input.file_path // empty')

if echo "$FILE" | grep -q '/.worktrees/'; then
  exit 0
fi

echo '{"decision":"block","reason":"Main worktree edit blocked.","additionalContext":"STOP. Re-read CLAUDE.md. Create a worktree with: git worktree add .worktrees/<name> -b <branch>, then edit files there."}'
exit 0
