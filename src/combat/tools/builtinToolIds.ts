// Builtin tool IDs — provides compile-time safety for internal references.
// Plugin tools use string IDs like 'plugin:<pluginId>:<toolId>'.

export const BuiltinToolId = {
  Select: 'select',
  Measure: 'measure',
  RangeCircle: 'range-circle',
  RangeCone: 'range-cone',
  RangeRect: 'range-rect',
  GridConfig: 'grid-config',
  ActionTargeting: 'action-targeting',
} as const

export type BuiltinToolId = (typeof BuiltinToolId)[keyof typeof BuiltinToolId]
