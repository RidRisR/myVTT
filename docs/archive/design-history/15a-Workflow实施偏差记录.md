# Workflow 系统实施偏差记录

> 对照 `15-Workflow系统设计.md` 的设计方案，记录实施过程中的偏差与决策理由。

---

## 1. Cloneable 类型：约定而非泛型约束

**设计文档**：使用 `Cloneable` 作为 `ctx.data` 的泛型约束。

**实际实现**：`Cloneable` 仅作为导出的文档类型，所有泛型默认值改为 `Record<string, unknown>`。

**原因**：TypeScript 的 interface 不具有隐式索引签名。`BaseRollData`（interface）无法赋值给 `Record<string, Cloneable>`，因为 interface 不会自动产生 `[key: string]: Cloneable` 索引签名。将其改为 `type` 会破坏插件的 `extends` 继承模式。

**影响**：编译期不强制 `ctx.data` 值的可克隆性；运行时通过 `structuredClone` 的 try/catch 降级处理。

---

## 2. BaseRollData 添加索引签名

**设计文档**：`BaseRollData` 为纯 interface，仅含 `formula`、`actorId`、`rolls?`、`total?`。

**实际实现**：添加 `[key: string]: unknown` 索引签名。

**原因**：Daggerheart 插件需要向 `ctx.data` 写入额外字段（如 `judgment`），这要求 `BaseRollData` 允许任意键。索引签名使得 `BaseRollData` 兼容 `Record<string, unknown>`，解决了泛型赋值问题。

**影响**：`ctx.data` 的已声明字段仍有类型提示；额外字段类型为 `unknown`，需插件自行 assert。

---

## 3. ctx.data 的 getter 实现方式

**设计文档**：使用 `Object.defineProperty` 的 getter-only 保护 `ctx.data` 引用不被替换。

**实际实现**：完全一致，使用 Proxy + getter 返回内部 `_data` 对象。直接属性赋值可行，引用替换抛出 TypeError。

**偏差**：无。

---

## 4. useWorkflowSDK 保留为向后兼容

**设计文档**：将 PluginSDK 与 WorkflowRunner 分离，UI 层使用 `useWorkflowRunner()`。

**实际实现**：一致。额外保留 `useWorkflowSDK()` 为 `@deprecated` 别名，委托给 `useWorkflowRunner()`。

**原因**：渐进迁移，避免一次性破坏所有消费者。

---

## 5. POC 插件导入（no-restricted-imports）

**设计文档**：描述了插件通过 registry 注册的机制，而非直接导入。

**实际实现**：`useWorkflowSDK.ts` 仍直接导入 `daggerheart-core` 和 `daggerheart-cosmetic` 插件，触发 `no-restricted-imports` ESLint 错误。

**原因**：这是 POC 阶段遗留的技术债，不在本次基础设施分支的改造范围内。后续需通过 room 配置或插件注册表来发现插件。

---

## 6. no-dynamic-delete 抑制

**设计文档**：非关键步骤失败时通过清空 + 恢复 snapshot 还原 `ctx.data`。

**实际实现**：使用 `for (const k of Object.keys(data)) delete data[k]` 清空对象，加 `eslint-disable` 注释。

**原因**：无法使用 `Object.assign({}, snapshot)` 因为需要就地修改同一对象引用。`delete` 是唯一的就地清空手段。

---

## 7. 设计文档中提到但未实施的特性

以下特性在设计文档中提及但标注为后续实施或超出本次范围：

- **插件拓扑排序激活**：`dependencies` 字段已添加到 `VTTPlugin` 类型，但实际的拓扑排序激活逻辑未实现（当前仍按数组顺序激活）
- **`onDeactivate` 回调**：类型已声明，但实际调用点未在本次分支中连接
- **Team Tracker 原子递增**：按 `project_workflow_scope.md` 记录，明确排除在本次基础设施范围之外

---

## Assumptions

- 插件数量在可预见的未来保持在个位数，因此线性扫描（如 `deactivatePlugin` 遍历所有 workflow）的性能开销可忽略
- `structuredClone` 在所有目标浏览器中可用（baseline 2022）
- 单个 workflow 的 step 数量不超过 ~50，使得 O(N) 祖先集计算不成为瓶颈
- POC 插件直接导入模式将在后续插件注册表实施时替换

## Edge Cases

- **空 workflow**：`defineWorkflow('name', [])` 合法，`runWorkflow` 立即返回 `{ status: 'completed', errors: [] }`
- **全部非关键步骤失败**：workflow 仍返回 `completed`（非 `aborted`），所有错误收集在 `result.errors`
- **structuredClone 失败**：若 `ctx.data` 包含不可克隆值（如函数），非关键步骤降级为无快照模式，失败时不恢复数据
- **循环 dependsOn**：`attachStep` 检测循环并抛出错误；`computeAncestors` 使用 `computing` 集合防止无限递归
- **重复 deactivatePlugin**：幂等操作，第二次调用不会抛错（因为 `removeStep` 幂等）
- **嵌套 workflow abort**：子 workflow 的 abort 不传播到父 workflow（各自独立的 `abortCtrl`）

## 总结

核心架构（WorkflowEngine、InternalState 注入、WorkflowHandle 幻影类型、PluginSDK/WorkflowRunner 分离、owner tracking + deactivation、attachStep + dependsOn 级联）完全按照设计文档实施。偏差集中在 TypeScript 类型系统的务实妥协和 POC 遗留技术债的有意保留。
