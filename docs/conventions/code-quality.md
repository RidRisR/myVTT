# Code Quality

## Formatting & Linting

- **Prettier**: no semicolons, single quotes, trailing commas, printWidth 100
- **ESLint**: TypeScript strict, react-hooks, `no-restricted-imports` for api module
- **TypeScript**: strict mode, noUnusedLocals, noUnusedParameters, noUncheckedIndexedAccess
- `react-hooks/set-state-in-effect` OFF — Socket.io listener pattern requires setState in effects

## Git Hooks

- **Husky**: pre-commit runs worktree isolation guard + lint-staged + tsc + doc structure check
- **Worktree isolation**: pre-commit hook blocks commits outside worktrees (compares `--git-dir` vs `--git-common-dir`). Agent must always use worktrees for feature work and audit `git diff --cached --stat` before every commit. NEVER use `--no-verify` to bypass

## Test Pyramid

| Tier        | Location                       | Stack                                    | Run command        |
| ----------- | ------------------------------ | ---------------------------------------- | ------------------ |
| Unit        | `src/**/__tests__/`            | vitest + jsdom + @testing-library/react  | `npm test`         |
| Integration | `server/__tests__/scenarios/`  | real Express + SQLite + Socket.io        | `npm test`         |
| E2E         | `e2e/scenarios/`               | Playwright, Page Object pattern          | `npm run test:e2e` |

- CI runs both; pre-push hook runs only unit + integration (E2E too slow for local hook)
