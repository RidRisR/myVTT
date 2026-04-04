// Register all builtin tools at app startup.
// This module must be imported once (side-effect) before any tool rendering.

import {
  MousePointer2,
  Ruler,
  Circle,
  Triangle,
  RectangleHorizontal,
  Grid3X3,
  Crosshair,
} from 'lucide-react'
import { toolRegistry } from './toolRegistry'
import { BuiltinToolId } from './builtinToolIds'
import { MeasureToolCanvas } from './MeasureTool'
import { RangeCircleCanvas, RangeConeCanvas, RangeRectCanvas } from './RangeTemplate'
import { getAllRenderers, createRendererPoint } from '../../log/rendererRegistry'
import type { ToolDefinition } from './types'

/** Typed token for plugin-registered combat tools. */
const PLUGIN_TOOL_POINT = createRendererPoint<ToolDefinition>('combat', 'tool')

toolRegistry.register({
  id: BuiltinToolId.Select,
  category: 'interaction',
  icon: MousePointer2,
  label: 'toolbar.select',
  shortcut: 'V',
  defaultMode: 'persistent',
})

toolRegistry.register({
  id: BuiltinToolId.Measure,
  category: 'measurement',
  icon: Ruler,
  label: 'toolbar.measure',
  shortcut: 'M',
  defaultMode: 'one-shot',
  CanvasLayer: MeasureToolCanvas,
})

toolRegistry.register({
  id: BuiltinToolId.RangeCircle,
  category: 'measurement',
  icon: Circle,
  label: 'toolbar.range_circle',
  shortcut: '1',
  defaultMode: 'one-shot',
  CanvasLayer: RangeCircleCanvas,
})

toolRegistry.register({
  id: BuiltinToolId.RangeCone,
  category: 'measurement',
  icon: Triangle,
  label: 'toolbar.range_cone',
  shortcut: '2',
  defaultMode: 'one-shot',
  CanvasLayer: RangeConeCanvas,
})

toolRegistry.register({
  id: BuiltinToolId.RangeRect,
  category: 'measurement',
  icon: RectangleHorizontal,
  label: 'toolbar.range_rect',
  shortcut: '3',
  defaultMode: 'one-shot',
  CanvasLayer: RangeRectCanvas,
})

toolRegistry.register({
  id: BuiltinToolId.GridConfig,
  category: 'gm',
  icon: Grid3X3,
  label: 'toolbar.grid',
  shortcut: 'G',
  gmOnly: true,
  defaultMode: 'persistent',
})

toolRegistry.register({
  id: BuiltinToolId.ActionTargeting,
  category: 'interaction',
  icon: Crosshair,
  label: 'toolbar.targeting',
  defaultMode: 'persistent',
  // Internal tool — no shortcut, not shown in toolbar
})

// ── Register plugin-provided tools ──────────────────────────────────────────
// Plugins register tools via sdk.ui.registerRenderer('combat', 'tool', toolDef) in onActivate.
// This function reads from RendererRegistry and forwards to the local toolRegistry.

export function registerPluginTools(): void {
  const pluginTools = getAllRenderers(PLUGIN_TOOL_POINT)
  for (const tool of pluginTools) {
    const namespacedId = tool.id.startsWith('plugin:') ? tool.id : `plugin:${tool.id}`
    toolRegistry.register({ ...tool, id: namespacedId, category: 'plugin' })
  }
}
