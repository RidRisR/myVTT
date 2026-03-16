# 运行时 Bug 分析与系统性预防

> 数据层重构（data-layer-impl）集成测试期间发现的 5 个运行时 bug 的根因分析、修复方案和系统性预防策略。

## Bug 清单

### Bug 1: zustand selector 引用不稳定 → React 无限重渲染

**现象**: `Maximum update depth exceeded` — 页面卡死
**根因**: `selectTokens` selector 返回 `s.combatInfo?.tokens ?? {}`，`?? {}` 每次调用创建新对象，破坏 zustand 的 `Object.is()` 相等检查
**同类问题**: `getSceneEntityIds` 返回 `?? []`

**修复**:

```ts
// ❌ 每次调用返回新引用
export const selectTokens = (s) => s.combatInfo?.tokens ?? {}

// ✅ 模块级常量，始终同一引用
const EMPTY_TOKENS: Record<string, MapToken> = {}
export const selectTokens = (s) => s.combatInfo?.tokens ?? EMPTY_TOKENS
```

**影响文件**: `selectors.ts`, `worldStore.ts`

---

### Bug 2: React hooks 在 early return 之后 → 渲染崩溃

**现象**: `Rendered more hooks than during the previous render`
**根因**: `useMemo` 放在 `if (isLoading) return <Loading/>` 之后。首次渲染（loading=true）跳过 hooks，二次渲染（loading=false）执行 hooks → hooks 数量不一致

**修复**: 所有 hooks 移到 early return 之前

```tsx
// ❌ hooks 在 early return 之后
if (isLoading) return <Loading />
const arr = useMemo(() => Object.values(data), [data])

// ✅ hooks 在 early return 之前
const arr = useMemo(() => Object.values(data), [data])
if (isLoading) return <Loading />
```

**影响文件**: `App.tsx`

---

### Bug 3: render 中内联派生计算 → 无限重渲染

**现象**: 与 Bug 1 相同的无限重渲染
**根因**: render body 中直接调用 `Object.values(entities)` 和 `selectSpeakerEntities()`，每次返回新数组引用，导致依赖它们的子组件/effects 不断触发

**修复**:

```tsx
// ❌ 每次 render 创建新数组
const entitiesArray = Object.values(entities)

// ✅ useMemo 缓存
const entitiesArray = useMemo(() => Object.values(entities), [entities])
```

**影响文件**: `App.tsx`

---

### Bug 4: 两步上传 → 400 Bad Request

**现象**: `POST /api/rooms/:roomId/assets` 返回 400
**根因**: 客户端分两步操作：(1) FormData 上传文件，(2) JSON 请求创建元数据。服务端 `POST /assets` 是 multer 路由，第二步 JSON 请求无文件 → "No file uploaded" 400

**附带问题**: 原始 `uploadAsset` URL 路径写成了 `/upload`（应为 `/assets`）→ 404

**修复**: 合并为单次 FormData 请求（文件 + 元数据一起发送）；服务端增加 DB 写入失败时的原子清理（删除已上传的孤立文件）

**影响文件**: `assetUpload.ts`, `assetStore.ts`, `server/routes/assets.ts`

---

### Bug 5: `res.sendFile()` 传入相对路径 → 500

**现象**: `GET /api/rooms/:roomId/uploads/:filename` 返回 500
**根因**: `DATA_DIR = './data'` 是相对路径。`path.join('./data', 'rooms', ...)` 产生相对路径。Express 的 `res.sendFile()` 要求绝对路径（除非传 `root` 选项），传入相对路径直接抛 TypeError

**修复**:

```ts
// ❌ 相对路径
const DATA_DIR = process.env.DATA_DIR || './data'

// ✅ 启动时解析为绝对路径
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
```

**影响文件**: `server/index.ts`

---

## Bug 分类与模式识别

| 类别            | Bug    | 根本原因                                                        | 检测难度                      |
| --------------- | ------ | --------------------------------------------------------------- | ----------------------------- |
| **引用稳定性**  | #1, #3 | JavaScript 值类型 vs 引用类型 + zustand 的 `Object.is` 相等检查 | 中（需理解 React 重渲染机制） |
| **React 规则**  | #2     | Hooks 不能条件执行                                              | 低（React 报错明确）          |
| **API 契约**    | #4     | 客户端与服务端路由不匹配                                        | 低（HTTP 400/404 明确）       |
| **Node.js API** | #5     | Express `sendFile` 要求绝对路径                                 | 中（500 不说明原因）          |

---

## 系统性预防策略

### 策略 1: 编码规范（已写入 CLAUDE.md）

已添加三条规则到 State Management 章节：

1. **Selector 回退值必须用模块级常量** — `?? {}` / `?? []` 在 selector 中创建新引用，必须改用 `const EMPTY: X[] = []`
2. **所有 hooks 必须在 early return 之前** — React 要求每次渲染 hooks 数量和顺序一致
3. **避免 render 中内联派生计算** — `Object.values()`、`.filter()` 等必须用 `useMemo` 包裹

### 策略 2: 自动化测试

#### 已有测试

- `src/stores/__tests__/selectors.test.ts` — 7 个引用稳定性测试，验证 selector 在相同输入下返回 `Object.is()` 相等的引用

#### 可扩展的测试方向

| 测试类型                | 覆盖的 Bug | 可行性                                                                                   |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| **Selector 引用稳定性** | #1         | ✅ 已实现 — 对每个 selector 验证两次调用返回同一引用                                     |
| **sendFile 绝对路径**   | #5         | ✅ 可实现 — 集成测试验证上传后的文件能正常下载                                           |
| **上传端到端**          | #4, #5     | ✅ 可实现 — 上传文件 → 获取 asset → 下载文件 → 验证内容一致                              |
| **Hooks 顺序**          | #2         | ⚠️ 难以单元测试 — 需要渲染组件并切换条件。ESLint `react-hooks/rules-of-hooks` 可静态检测 |
| **内联派生计算**        | #3         | ⚠️ 难以自动检测 — 需要 review 或自定义 lint 规则                                         |

### 策略 3: ESLint 规则

| 规则                                             | 预防的 Bug          | 状态                                    |
| ------------------------------------------------ | ------------------- | --------------------------------------- |
| `react-hooks/rules-of-hooks`                     | #2 (hooks 条件执行) | ✅ 已启用（React 默认）                 |
| `react-hooks/exhaustive-deps`                    | #3 (缺少依赖)       | ✅ 已启用（warn）                       |
| 自定义规则：禁止 selector 中的 `?? {}` / `?? []` | #1                  | ❌ 需自定义 ESLint 插件，投入产出比不高 |

### 策略 4: 结构性防护

| 防护                                      | 预防的 Bug | 方式                           |
| ----------------------------------------- | ---------- | ------------------------------ |
| `path.resolve(DATA_DIR)` 启动时一次性解析 | #5         | 所有下游代码自动获得绝对路径   |
| multer 单路由设计                         | #4         | 文件 + 元数据在同一请求中处理  |
| DB 失败时原子清理                         | #4 附带    | `catch` 块删除已上传的孤立文件 |

---

## 代码库扫描结果

对当前代码库的全面扫描确认**没有残留的同类问题**：

| 模式                                                  | 扫描范围                  | 结果                                                                                    |
| ----------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `?? {}` / `?? []` 在 selector 返回值中                | `src/stores/selectors.ts` | ✅ 全部使用模块级常量                                                                   |
| Hooks 在 early return 之后                            | 所有 `.tsx` 组件          | ✅ 所有组件 hooks 在 early return 之前                                                  |
| `Object.values()` 等在 render body 中未包裹 `useMemo` | 所有 `.tsx` 组件          | ✅ App.tsx 已修复；其余文件的 `.filter()/.map()` 操作在 props/局部变量上，非 store 数据 |
| `sendFile` 传入相对路径                               | `server/`                 | ✅ DATA_DIR 已 resolve                                                                  |
| 两步上传模式                                          | `src/shared/`             | ✅ 已合并为单步                                                                         |

---

## 测试覆盖建议

### 高优先级：扩展 selectors.test.ts

为所有新增的 selector 和 store getter 添加引用稳定性测试，确保：

- 相同 state 下两次调用返回 `===` 相同引用
- `null` / 空状态下返回稳定的常量引用

### 高优先级：上传端到端测试

验证完整的上传 → 存储 → 下载流程：

1. POST 上传文件 → 201 + asset metadata
2. GET asset URL → 200 + 文件内容一致
3. DELETE asset → 200 + 文件从磁盘删除
