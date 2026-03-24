# POC 实施偏差记录

> 本文档记录 POC 实现与设计文档 `07-POC执行方案.md` 之间的偏差，包括原因和实际采用的方案。

---

## 1. Workflow 步骤内的类型访问方式

**设计文档预期**：步骤函数通过泛型 `WorkflowContext<TData>` 直接访问 `ctx.vars`、`ctx.updateComponent` 等。

**实际实现**：步骤函数接收的是旧 `WorkflowContext` 类型（engine 签名限制），通过 `as unknown as { vars: DealDamageState }` 类型断言访问 POC 扩展字段。

**原因**：`WorkflowEngine.runWorkflow()` 签名为 `(name: string, ctx: WorkflowContext, internal: InternalState)`，其中 `WorkflowContext` 不包含 `vars`、`read`、`updateComponent` 等新接口。POC context 是运行时超集，但编译时类型不匹配。修改 engine 签名超出 POC 范围。

**影响**：步骤代码需要手动类型断言，DX 不够理想。正式迁移时应升级 `WorkflowContext` 接口，消除断言需求。

---

## 2. Workflow Runner 注入方式

**设计文档预期**：面板组件通过 `sdk.workflow.runWorkflow()` 触发 workflow。

**实际实现**：使用模块级 handler 注入模式（`spellDropHandler.ts`）。`PocApp.tsx` 初始化时注册 handler，`EntityCard` 通过 `getSpellDropHandler()` 获取。

**原因**：POC 不实现完整的 `IComponentSDK` 注入机制（UIRegistry + PanelRenderer + makeSDK 工厂链路）。模块级 handler 是最简实现方式，足以验证"DnD → workflow → data → re-render"通路。

**影响**：无。正式版本中组件将通过 `sdk.workflow.runWorkflow()` 调用，handler 注入模式仅限 POC。

---

## 3. spellDropHandler 独立文件

**设计文档预期**：`EntityCard.tsx` 内部直接包含 `setSpellDropHandler`。

**实际实现**：提取为独立 `poc/panels/spellDropHandler.ts` 文件。

**原因**：React Fast Refresh 要求组件文件仅导出 React 组件。混合导出函数和组件会触发 HMR 全量刷新警告。

**影响**：无功能影响，仅文件组织差异。

---

## 4. EventBus useEvent 的 deps 警告抑制

**设计文档预期**：`useEvent` 的 `useEffect` deps 为 `[handle.key]`。

**实际实现**：添加 `// eslint-disable-next-line react-hooks/exhaustive-deps` 注释抑制警告。

**原因**：`handle` 对象每次渲染可能是新引用（即使 `.key` 相同），但 effect 只需在 `key` 变化时重新订阅。ESLint 规则要求 `handle` 在 deps 中，但这会导致不必要的重订阅。使用 `handle.key` 作为 dep 是正确的语义。

**影响**：无。正式版本可通过 `useMemo` 稳定化 handle 引用来消除 lint 警告。

---

## 5. PocPanelRenderer 简化

**设计文档预期**：增强版 PanelRenderer，完整的面板定位和错误边界。

**实际实现**：简化为仅处理 `instanceProps` 工厂函数解析的组件，不含面板定位逻辑或 PanelErrorBoundary 包裹。

**原因**：POC 的核心验证目标是 instanceProps 动态绑定机制，不是布局系统。面板定位复用现有 `PanelRenderer` 即可，无需在 POC 中重新实现。

**影响**：无。动态绑定机制已验证，布局集成在正式版本中进行。

---

## 6. requestInput 未集成到 PocWorkflowContext

**设计文档预期**：`ctx.requestInput(handle, context)` 作为 context 方法暂停 workflow。

**实际实现**：`requestInput` 作为 `sessionStore.ts` 的独立函数实现，未挂载到 `PocWorkflowContext`。

**原因**：独立函数已充分验证暂停/恢复/取消机制（8 个测试）。将其集成到 context 需要处理 WorkflowEngine 的异步步骤支持（当前步骤是同步的），超出 POC 范围。

**影响**：正式迁移时需在 WorkflowContext 中添加 `requestInput` 方法，并确保 engine 支持异步步骤执行。
