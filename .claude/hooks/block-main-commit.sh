#!/bin/bash
# Block file edits in the main worktree.
# All development must happen in a separate git worktree.
# Used as a PreToolUse hook for Edit and Write tools.

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Resolve git context from the file's directory, not CWD
FILE_DIR=$(dirname "$FILE" 2>/dev/null)
if [ -z "$FILE_DIR" ] || [ ! -d "$FILE_DIR" ]; then
  exit 0
fi

GIT_DIR=$(git -C "$FILE_DIR" rev-parse --git-dir 2>/dev/null)
GIT_COMMON=$(git -C "$FILE_DIR" rev-parse --git-common-dir 2>/dev/null)

# If git-dir equals git-common-dir, the file is in the main worktree
if [ "$GIT_DIR" = "$GIT_COMMON" ]; then
  echo "BLOCKED: Do not edit files in the main worktree. Re-read CLAUDE.md, create a worktree, then retry." >&2
  exit 2
fi

exit 0
