# Token 属性系统设计

**Goal:** 给画布上的任意图片添加自由属性标签（key-value），通过右键菜单添加，悬浮时显示属性卡片，所有属性通过 Yjs 自动同步。

**Architecture:** 不创建自定义 Shape。利用 tldraw 原生 Image Shape 的 `meta` 字段存储自由属性，自定义右键菜单提供添加/编辑入口，悬浮时渲染属性卡片覆盖层。

**Tech Stack:** tldraw v4 (meta, context menu override, components override), React

---

## 核心实现

### 1. 属性存储 — Shape meta 字段

tldraw 每个 Shape 都有 `meta: Record<string, unknown>`，可自由写入，且通过 store 自动同步。

```typescript
// 添加属性
editor.updateShape({
  id: shape.id,
  type: shape.type,
  meta: {
    ...shape.meta,
    properties: [
      ...(shape.meta.properties ?? []),
      { key: 'HP', value: '10' }
    ]
  }
})
```

数据结构：
```typescript
type ShapeProperty = { key: string; value: string }

// shape.meta.properties: ShapeProperty[]
```

### 2. 自定义右键菜单

tldraw v4 支持覆盖 `components.ContextMenu`，在原有菜单基础上添加「添加属性」选项。

点击后弹出一个简单的对话框（key + value 输入框）。

### 3. 悬浮属性卡片

通过 tldraw 的 `components` 覆盖或在画布外层添加 overlay：
- 监听鼠标位置 / editor 的 hoveredShape
- 当 hover 到有 properties 的 Shape 时，在鼠标旁显示属性卡片
- 卡片展示所有 key-value 属性

### 4. 同步

meta 字段通过 tldraw store 变更 → Yjs 自动同步，无需额外处理。

## 验证标准

1. 拖入一张图片到画布
2. 右击图片，选择「添加属性」，输入 key="HP" value="10"
3. 鼠标悬浮到图片上，看到属性卡片显示 "HP: 10"
4. 另一个浏览器窗口也能看到相同的属性
