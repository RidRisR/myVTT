#!/bin/bash
# Re-inject critical CLAUDE.md constraints into context.
# Used after context compaction and when subagents start.

cat << 'EOF'
REMINDER: Re-read CLAUDE.md. Key rules:
1. NEVER edit/commit on main — create a feature branch first
2. Check the Required Reading table before coding (store-actions, bug-fix-workflow, server-infrastructure, git-workflow, ui-patterns)
3. Bug fixes MUST include: root cause → regression test → systemic prevention
EOF
