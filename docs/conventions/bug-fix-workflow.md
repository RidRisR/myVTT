# Bug Fix Workflow

## Rule

Every bug fix **MUST** include these four steps:

1. **Fix the bug** — minimal correct fix
2. **Add a regression test** — must fail without the fix, pass with it
3. **Systemic prevention** — can this class of bug be prevented by a rule/constraint/type? If so, implement it
4. **Update docs** — if the bug reveals non-obvious framework behavior, document it in CLAUDE.md

## PR Compliance

Bug fix PRs **MUST** include all of these sections in the description:

- `## Root Cause` — root cause analysis
- `## Regression Test` — test file path
- `## Systemic Prevention` — prevention measure (or explanation of why none is needed)

## Systemic Prevention Examples

| Problem                                      | Prevention                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| Express `send` rejects dotfile paths         | Document in CLAUDE.md + file-serving round-trip test    |
| `app.param()` middleware                     | Structural guard, auto-validate all route params        |
| Duplicate data sources in stores             | Single source of truth rule (see `store-actions.md`)    |
| Multi-step async logic in component closures | ESLint `no-restricted-imports` (see `store-actions.md`) |
| Konva events bubbling to DOM                 | Document framework-specific behavior in CLAUDE.md       |
