#!/bin/bash
# Validates that design documents include required sections.
# Usage: scripts/check-doc-structure.sh <file>
# See docs/conventions/bug-fix-workflow.md for requirements.

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

ERRORS=0

# docs/design/ documents must include Assumptions and Edge Cases sections
if [[ "$FILE" == docs/design/* ]]; then
  for section in "## Assumptions" "## Edge Cases"; do
    if ! grep -q "$section" "$FILE" 2>/dev/null; then
      echo "❌ $FILE: missing required section '$section'"
      echo "   See docs/conventions/bug-fix-workflow.md for requirements"
      ERRORS=$((ERRORS + 1))
    fi
  done
fi

exit $ERRORS
