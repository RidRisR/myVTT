// Register all builtin tools at app startup.
// This module must be imported once (side-effect) before any tool rendering.

import { MousePointer2, Ruler, Circle, Triangle, RectangleHorizontal, Grid3X3 } from 'lucide-react'
import { toolRegistry } from './toolRegistry'
import { BuiltinToolId } from './builtinToolIds'
import { MeasureToolCanvas } from './MeasureTool'
import { RangeCircleCanvas, RangeConeCanvas, RangeRectCanvas } from './RangeTemplate'

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
