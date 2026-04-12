# myVTT Agent Guidelines

These instructions apply to the entire repository.

## Branch And Worktree Safety

- Never develop directly on `main`.
- Do not commit, edit, or create source files for commit in the main worktree.
- Create and use a feature branch/worktree first.
- Read [docs/conventions/git-workflow.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/git-workflow.md) before branch, commit, or PR work.

## Required Reading Before Coding

Read the matching document before making changes in these areas:

- User actions or click handlers that call APIs: [docs/conventions/store-actions.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/store-actions.md)
- Bug fixes: [docs/conventions/bug-fix-workflow.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/bug-fix-workflow.md)
- Server routes or middleware: [docs/conventions/server-infrastructure.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/server-infrastructure.md)
- UI components or styling: [docs/conventions/ui-patterns.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/ui-patterns.md)
- Sandbox patterns: [docs/conventions/sandbox-authoring.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/sandbox-authoring.md)

## Bug Fix Requirements

- Every bug fix must identify the root cause.
- Every bug fix must add a regression test.
- Every bug fix should add systemic prevention for the same bug category when feasible.
- PRs for bug fixes should include `Root Cause`, `Regression Test`, and `Systemic Prevention`.

## Architecture Gotchas

- Konva right-click handling requires `e.evt.stopPropagation()`. `preventDefault()` alone is not enough.
- Do not call `.filter()` or `.sort()` inside zustand selectors. Derive those values in components.
- Use module-level constants for zustand fallback defaults. Do not inline `?? []` or similar new references.
- Keep render-controlling flags in the same zustand `set()` call as the data they depend on.
- Every client-side `socket.on()` needs a matching server emit path, and new connections must receive catch-up state.
- `res.sendFile()` must include `dotfiles: 'allow'`.
- Do not place fixed-position Radix overlay anchors inside transformed ancestors.
- Do not set inline `style.transform` on elements already using Tailwind transform utilities.
- Do not use container-level `stopPropagation` around Radix overlays; prefer `pointer-events` isolation.

## Key References

- Architecture overview: [docs/architecture/overview.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/architecture/overview.md)
- Data model: [docs/architecture/data-model.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/architecture/data-model.md)
- State management: [docs/architecture/state-management.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/architecture/state-management.md)
- Tactical system: [docs/architecture/tactical-system.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/architecture/tactical-system.md)
- Rule plugin system: [docs/architecture/rule-plugin-system.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/architecture/rule-plugin-system.md)
- Code quality: [docs/conventions/code-quality.md](/Users/zhonghanzhen/Desktop/proj/myVTT/main_worktrees/ivory-horizon/docs/conventions/code-quality.md)

## Documentation Language

- New design, spec, and plan documents should be written in Chinese.
- Code comments and convention docs should remain in English unless an existing file establishes a different pattern.
