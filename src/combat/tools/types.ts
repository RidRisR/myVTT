// Tool system type definitions
// These types define the interface for all tools (builtin and plugin).

export type ToolCategory = 'interaction' | 'measurement' | 'drawing' | 'gm' | 'camera' | 'plugin'

export interface ToolLayerProps {
  stageRef: React.RefObject<Konva.Stage | null>
  tacticalInfo: TacticalInfo
  stageScale: number
  stagePos: { x: number; y: number }
  gridSize: number
  gridSnap: boolean
  onComplete?: () => void
}

export interface ToolDefinition {
  id: string
  category: ToolCategory
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  shortcut?: string
  gmOnly?: boolean
  defaultMode: 'one-shot' | 'persistent'

  onActivate?: () => void
  onDeactivate?: () => void

  /** Konva canvas layer rendered when this tool is active */
  CanvasLayer?: React.ComponentType<ToolLayerProps>

  /** Options panel (HTML overlay, e.g. grid config) */
  OptionsPanel?: React.ComponentType
}

// Avoid importing heavy dependencies in this types-only file.
// Consumers provide the concrete types via the interfaces above.
import type Konva from 'konva'
import type { TacticalInfo } from '../../stores/worldStore'
