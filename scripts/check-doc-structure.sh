#!/bin/bash
# Validates that design documents include required status line.
# Usage: scripts/check-doc-structure.sh <file>
# Status line format: > **状态**：<emoji> <label> | YYYY-MM-DD

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

ERRORS=0

# docs/design/ documents must include a status line
if [[ "$FILE" == docs/design/* ]]; then
  if ! grep -qE "^\*\*状态\*\*|^> \*\*状态\*\*" "$FILE" 2>/dev/null; then
    echo "❌ $FILE: missing required status line"
    echo "   Add '> **状态**：📋 规划中 | YYYY-MM-DD' after the title"
    echo "   Valid statuses: 📋 规划中 | 🚧 实施中 | ✅ 活跃参考 | ⚠️ 需重新设计"
    ERRORS=$((ERRORS + 1))
  fi
fi

exit $ERRORS
