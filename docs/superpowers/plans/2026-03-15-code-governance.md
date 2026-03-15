# 代码治理体系实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 建立三层防线（ESLint 代码级 → pre-commit 文档级 → 精简 CLAUDE.md 知识级），使 Agent 和人类开发者在违反规范时被自动拦截，而非靠记忆遵守。

**架构:** ESLint `no-restricted-imports` 阻止组件直接调用 api → convention docs 定义可 grep 验证的文档结构 → CLAUDE.md 精简为 ~80 行索引文件，详细规则指向 convention docs。

**技术栈:** ESLint flat config, husky pre-commit hooks, shell scripts

---

## Chunk 1: Layer 1 — ESLint 代码级强制

### Task 1: 修复现有违规 — PortraitBar.tsx

当前唯一违规：`src/layout/PortraitBar.tsx:255` 的 `handleSaveAsBlueprint()` 直接调用 `api.post()`。

**Files:**

- Modify: `src/stores/worldStore.ts` (添加 store method)
- Modify: `src/layout/PortraitBar.tsx` (删除 api import，改为调用 store method)

- [ ] **Step 1: 在 worldStore 添加 `saveEntityAsBlueprint` 方法**

在 `worldStore.ts` 的 actions 区域添加：

```ts
saveEntityAsBlueprint: async (entity: Entity) => {
  const roomId = get()._roomId
  if (!roomId) return
  await api.post(`/api/rooms/${roomId}/assets`, {
    url: entity.imageUrl,
    name: entity.name,
    type: 'blueprint',
    extra: {
      blueprint: {
        defaultSize: entity.width,
        defaultColor: entity.color,
        defaultRuleData: entity.ruleData,
      },
    },
  })
},
```

- [ ] **Step 2: 更新 PortraitBar.tsx**

删除 `import { api } from '../shared/api'`。

将 `handleSaveAsBlueprint` 改为调用 store method：

```tsx
const handleSaveAsBlueprint = (entity: Entity) => {
  useWorldStore.getState().saveEntityAsBlueprint(entity)
}
```

- [ ] **Step 3: 运行测试验证不破坏现有功能**

Run: `npm test`
Expected: 549 tests passing

- [ ] **Step 4: 提交**

```bash
git add src/stores/worldStore.ts src/layout/PortraitBar.tsx
git commit -m "refactor: move saveEntityAsBlueprint to worldStore (Store Action Convention)"
```

### Task 2: 添加 ESLint `no-restricted-imports` 规则

**Files:**

- Modify: `eslint.config.js`

- [ ] **Step 1: 在 eslint.config.js 添加规则**

在现有 `files: ['**/*.{ts,tsx}']` block 的 rules 中，添加针对**非 store 文件**的限制。需要一个新的 config block，因为此规则只针对 `src/` 下非 `stores/` 的文件：

```js
// Enforce Store Action Convention: only store files may import api
{
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/stores/**', 'src/shared/__tests__/**', 'src/shared/api.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/shared/api', '**/shared/api.ts'],
        message: 'Store Action Convention: api must only be imported in src/stores/. Move API calls to a store method.',
      }],
    }],
  },
},
```

- [ ] **Step 2: 运行 eslint 验证规则生效**

Run: `npx eslint src/layout/PortraitBar.tsx`（此时应该已经没有 api import 了，所以通过）

验证规则本身是否正确加载：

Run: `npx eslint --print-config src/layout/PortraitBar.tsx | grep no-restricted`
Expected: 输出包含 `no-restricted-imports`

- [ ] **Step 3: 验证 store 文件不受影响**

Run: `npx eslint src/stores/worldStore.ts`
Expected: 通过（no errors related to api import）

- [ ] **Step 4: 运行全量 lint**

Run: `npx eslint .`
Expected: 无新错误

- [ ] **Step 5: 提交**

```bash
git add eslint.config.js
git commit -m "chore: add ESLint no-restricted-imports — enforce Store Action Convention"
```

---

## Chunk 2: Layer 2 — Convention Docs + 文档结构检查

### Task 3: 创建 convention 文档

**Files:**

- Create: `docs/conventions/store-actions.md`
- Create: `docs/conventions/bug-fix-workflow.md`
- Create: `docs/conventions/server-infrastructure.md`
- Create: `docs/conventions/git-workflow.md`

- [ ] **Step 1: 创建 `docs/conventions/store-actions.md`**

```markdown
# Store Action Convention（Store 操作规范）

## 规则

所有涉及 API 调用的用户操作 **必须** 是 Store 方法（`src/stores/*.ts`）。
组件的 onClick handler **必须** 是单行调用。

## 为什么

Store 方法可以在 Node.js 集成测试中直接调用，验证完整链路（Store → HTTP → SQLite → Socket → Store）。
组件闭包中的多步异步逻辑无法在没有浏览器的情况下测试。

## 合规要求

1. 组件文件不可 import `api` 模块 — ESLint `no-restricted-imports` 自动拦截
2. 每个新增的用户可见流程必须有对应的集成测试（`server/__tests__/scenarios/*.test.ts`）

## 验证方式

- **代码级**: ESLint `no-restricted-imports` 在 commit 时自动拦截
- **测试级**: PR review 检查是否有对应的集成测试
```

- [ ] **Step 2: 创建 `docs/conventions/bug-fix-workflow.md`**

```markdown
# Bug Fix Workflow（Bug 修复流程）

## 规则

每个 bug fix **必须** 包含以下四步：

1. **修复 bug** — 最小正确修复
2. **添加回归测试** — 没有修复时测试应失败，有修复时应通过
3. **系统化防治** — 这类 bug 能否通过规则/约束/类型防止？如果能，落实它
4. **更新文档** — 如果涉及框架非直觉行为，记录到 CLAUDE.md

## 合规要求

PR 描述中必须包含以下段落（缺一不可）：

- `## Root Cause` — 根因分析
- `## Regression Test` — 回归测试文件路径
- `## Systemic Prevention` — 系统化防治措施（或说明为什么不需要）
```

- [ ] **Step 3: 创建 `docs/conventions/server-infrastructure.md`**

```markdown
# Server Infrastructure Rule（服务端基础设施规范）

## 规则：一个概念一个门控

同一个概念（如"房间是否存在"）在系统中只能有一个判定来源。
REST 中间件和 Socket.io 认证 **必须** 使用相同的检查逻辑。

## 当前设计

- `POST /api/rooms` 是创建房间的唯一入口
- 全局 `rooms` 表是"房间是否存在"的唯一真相源
- `withRoom` 和 `setupSocketAuth` 都先查全局 `rooms` 表

## 合规要求

新增任何服务端中间件时，必须回答：

- 这个检查的真相源是什么？
- 是否已有另一个中间件做同样的检查？如果有，必须复用同一个函数。
```

- [ ] **Step 4: 创建 `docs/conventions/git-workflow.md`**

```markdown
# Git Workflow（Git 工作流规范）

## 规则

1. 所有开发必须在 worktree + 独立分支上进行
2. main 分支只接受 squash merge
3. PR 创建和 merge 是两个独立步骤，merge 需要用户明确指示
4. Commit message 使用英文，遵循 conventional commits 格式
5. 不添加 Co-Authored-By 或 AI 声明

## 分支命名

- `feat/<name>` — 新功能
- `fix/<name>` — bug 修复
- `chore/<name>` — 维护性工作
- `refactor/<name>` — 重构

## Worktree 目录

`.worktrees/<branch-name>`（已在 .gitignore 中）
```

- [ ] **Step 5: 提交**

```bash
git add docs/conventions/
git commit -m "docs: add convention docs for store-actions, bug-fix, server-infra, git-workflow"
```

### Task 4: 添加文档结构检查脚本

**Files:**

- Create: `scripts/check-doc-structure.sh`
- Modify: `.husky/pre-commit`

- [ ] **Step 1: 创建 `scripts/check-doc-structure.sh`**

```bash
#!/bin/bash
# 检查 docs/design/ 下新增/修改的文档是否包含必要段落
# 用法: scripts/check-doc-structure.sh <file>

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE"
  exit 1
fi

ERRORS=0

# docs/design/ 下的设计文档必须包含 Assumptions 和 Edge Cases
if [[ "$FILE" == docs/design/* ]]; then
  for section in "## Assumptions" "## Edge Cases"; do
    if ! grep -q "$section" "$FILE" 2>/dev/null; then
      echo "❌ $FILE: missing required section '$section'"
      echo "   See docs/conventions/design-review.md for requirements"
      ERRORS=$((ERRORS + 1))
    fi
  done
fi

exit $ERRORS
```

- [ ] **Step 2: 让脚本可执行**

Run: `chmod +x scripts/check-doc-structure.sh`

- [ ] **Step 3: 更新 `.husky/pre-commit`**

在现有内容后追加：

```bash
# Check doc structure for design docs
for file in $(git diff --cached --name-only -- 'docs/design/*.md'); do
  scripts/check-doc-structure.sh "$file" || exit 1
done
```

- [ ] **Step 4: 测试 hook — 创建一个不合规的设计文档**

```bash
mkdir -p docs/design
echo "# Test Doc" > docs/design/test-invalid.md
git add docs/design/test-invalid.md
git commit -m "test: should fail"
```

Expected: commit 失败，提示缺少 `## Assumptions` 和 `## Edge Cases`

- [ ] **Step 5: 清理测试文件**

```bash
git reset HEAD docs/design/test-invalid.md
rm docs/design/test-invalid.md
```

- [ ] **Step 6: 提交**

```bash
git add scripts/check-doc-structure.sh .husky/pre-commit
git commit -m "chore: add pre-commit hook for design doc structure validation"
```

---

## Chunk 3: Layer 3 — 精简 CLAUDE.md

### Task 5: 重组 CLAUDE.md

将 CLAUDE.md 从 286 行精简到 ~100 行。详细规则移到 convention docs，CLAUDE.md 只保留：

- 项目简介 + 技术栈
- 架构关键点（不可 lint 的框架特殊行为）
- 指向 convention docs 的链接表

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: 重写 CLAUDE.md**

保留的内容：

1. Project Overview（精简到 3 行）
2. Tech Stack（表格）
3. Critical Architecture Notes（Entity System, react-konva, Token Drag, zustand pitfalls）
4. UI Design Patterns（design tokens, z-index, Konva gotchas）
5. Convention 链接表（指向 `docs/conventions/`）
6. 产品设计原则（3 行）

移除的内容（已迁移到 convention docs）：

- Store Action Convention 的详细说明 → `docs/conventions/store-actions.md`
- Bug Fix Workflow 的详细说明 → `docs/conventions/bug-fix-workflow.md`
- Server Infrastructure Rule → `docs/conventions/server-infrastructure.md`
- Git Workflow 的详细说明 → `docs/conventions/git-workflow.md`
- Single Source of Truth Rule → 合并入 `store-actions.md`
- Integration Testing 详细说明 → 合并入 `store-actions.md`

在精简后的 CLAUDE.md 中，每个被移除的段落替换为一行链接：

```markdown
## Conventions (详见 docs/conventions/)

| Convention              | File                                                                  | Enforcement                    |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------ |
| Store Action Convention | [store-actions.md](docs/conventions/store-actions.md)                 | ESLint `no-restricted-imports` |
| Bug Fix Workflow        | [bug-fix-workflow.md](docs/conventions/bug-fix-workflow.md)           | PR review                      |
| Server Infrastructure   | [server-infrastructure.md](docs/conventions/server-infrastructure.md) | Code review                    |
| Git Workflow            | [git-workflow.md](docs/conventions/git-workflow.md)                   | Git hooks                      |
```

- [ ] **Step 2: 验证 CLAUDE.md 行数**

Run: `wc -l CLAUDE.md`
Expected: < 120 行

- [ ] **Step 3: 运行全量测试确认不影响功能**

Run: `npm test`
Expected: 549 tests passing

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: simplify CLAUDE.md — extract conventions to docs/conventions/"
```

---

## 完成后验证

- [ ] `npx eslint .` — 零错误
- [ ] `npm test` — 549 tests passing
- [ ] 手动尝试在组件文件添加 `import { api } from '../shared/api'` → ESLint 报错
- [ ] 手动创建缺少必要段落的设计文档 → pre-commit hook 拦截
- [ ] CLAUDE.md < 120 行
