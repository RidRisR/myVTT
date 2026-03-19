# myVTT - Lightweight Scene-Based VTT

React + Socket.io + SQLite VTT with dual-mode: Scene (atmosphere) + Tactical (combat tokens on react-konva canvas).

## ⚠️ NEVER Commit Directly on main

**All development MUST happen on a feature branch** (via worktree and `git checkout -b`). Do NOT commit, edit, or create files intended for commit on the `main` branch. Always create a branch first before writing any code. See [git-workflow.md](docs/conventions/git-workflow.md).

## ⚠️ MANDATORY — Required Reading Before You Code

**STOP. Before writing any code, check the table below. If your task matches a trigger, you MUST read the linked document first. Do NOT skip this step.**

| When you are…                                        | Read first                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| Adding a click handler / user action that calls APIs | [store-actions.md](docs/conventions/store-actions.md)                 |
| Fixing any bug                                       | [bug-fix-workflow.md](docs/conventions/bug-fix-workflow.md)           |
| Adding or modifying server routes / middleware       | [server-infrastructure.md](docs/conventions/server-infrastructure.md) |
| Creating branches, committing, or opening PRs        | [git-workflow.md](docs/conventions/git-workflow.md)                   |
| Working on UI components or styling                  | [ui-patterns.md](docs/conventions/ui-patterns.md)                     |

## ⚠️ Bug Fix Discipline

**Every bug fix MUST**: identify root cause → add regression test → propose & implement systemic prevention for the entire bug category. PR must have `## Root Cause`, `## Regression Test`, `## Systemic Prevention` sections. See [bug-fix-workflow.md](docs/conventions/bug-fix-workflow.md).

## Architecture Gotchas (cannot be linted — read before touching these areas)

- **Konva right-click**: `e.evt.stopPropagation()` required — `preventDefault()` alone does NOT stop DOM-level `contextmenu` from firing
- **zustand selectors**: No `.filter()/.sort()` in stores (new refs → infinite re-renders). Use `useMemo` in components
- **zustand fallbacks**: Module-level constants for defaults (`const EMPTY: X[] = []`), never inline `?? []`
- **zustand data flags**: Flags controlling render must be in the same `set()` call as the data (no `useState` + `useEffect` timing gaps)
- **Socket.io**: Every client `socket.on()` MUST have a server-side `io.emit()`. New connections must receive catch-up state
- **Express**: `res.sendFile()` MUST include `dotfiles: 'allow'`
- **CSS containing block**: `transform`/`filter`/`will-change` on a parent makes child `position: fixed` relative to that parent, not viewport. Radix `Popover.Anchor` with `fixed` positioning must be outside any transformed container. DialogContent uses flex centering (no transform) to avoid this — do NOT add transform-based centering back
- **Tailwind transform vs imperative DOM**: Never set `style.transform` on elements using Tailwind transform utilities (`-translate-*`, `rotate-*`, `scale-*`) — Tailwind composes all transforms into one `transform` property via CSS vars, and inline `style.transform` wipes them all. For programmatic positioning, use `position: relative` + `left`/`top` (does not create containing block for fixed children)

## Reference Docs

| Document                                                      | What it covers                                   |
| ------------------------------------------------------------- | ------------------------------------------------ |
| [overview](docs/architecture/overview.md)                     | Tech stack, data flow, module map, Socket events |
| [data-model](docs/architecture/data-model.md)                 | SQLite schema, Entity/Scene/Token types          |
| [state-management](docs/architecture/state-management.md)     | zustand stores, Socket.io handlers               |
| [tactical-system](docs/architecture/tactical-system.md)       | KonvaMap layers, Token drag, Archive save/load   |
| [rule-plugin-system](docs/architecture/rule-plugin-system.md) | RulePlugin interface, registry, SDK              |
| [code-quality.md](docs/conventions/code-quality.md)           | Prettier, ESLint, TypeScript, test pyramid       |

## Documentation Language

- New docs (design, plans, specs): Chinese (中文)
- Code comments, CLAUDE.md, and convention docs (`docs/conventions/`): English
