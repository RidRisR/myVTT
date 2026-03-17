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

## E2E Failure Triage SOP

When e2e tests fail, follow this order **strictly** — do not skip to code analysis:

1. **Regression baseline** — Run the same tests on `main` first. If `main` passes and the PR branch fails, it's a regression introduced by the PR. If both fail, it's a pre-existing flake — don't waste time debugging the PR.
2. **Screenshots & traces** — Open the failure screenshot / Playwright trace. What does the page actually show? (e.g. error messages, blank screen, wrong route). This is the single highest-value step.
3. **Console & network errors** — Check for 4xx/5xx responses, uncaught exceptions, or failed WebSocket connections in the trace's network tab.
4. **Diff the PR** — Review changed files, especially global middleware (`server/index.ts`), configuration, and anything that affects all requests (rate limiters, CORS, auth).
5. **Analyze code logic** — Only after steps 1–4. Timeout errors are symptoms, not causes — the root cause is whatever made the expected element not appear.

### Common traps

| Symptom                         | Instinct (wrong)                  | Reality (check first)                                           |
| ------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| `Timeout waiting for element`   | Race condition / timing issue     | Page might show an error — check screenshot                     |
| Multiple tests fail in sequence | Each test is independently broken | Likely a cascade — first failure poisons later tests            |
| Works locally, fails in CI      | Flaky / needs longer timeout      | CI might have different env (rate limits, resource constraints) |
