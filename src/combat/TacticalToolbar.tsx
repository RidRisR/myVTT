import type { RefObject } from 'react'
import {
  MousePointer2,
  Ruler,
  Circle,
  Triangle,
  RectangleHorizontal,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  Maximize,
  LocateFixed,
} from 'lucide-react'
import type { KonvaMapHandle } from './KonvaMap'
import type { TacticalInfo } from '../stores/worldStore'
import { useWorldStore } from '../stores/worldStore'
import { useUiStore, type ActiveTool } from '../stores/uiStore'
import { GridConfigPanel } from './tools/GridConfigPanel'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'

const ICON_SIZE = 16
const ICON_STROKE = 1.5

interface ToolDef {
  id: ActiveTool
  icon: React.ElementType
  label: string
  shortcut: string
}

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: 'V' },
  { id: 'measure', icon: Ruler, label: 'Measure', shortcut: 'M' },
  { id: 'range-circle', icon: Circle, label: 'Circle', shortcut: '1' },
  { id: 'range-cone', icon: Triangle, label: 'Cone', shortcut: '2' },
  { id: 'range-rect', icon: RectangleHorizontal, label: 'Rectangle', shortcut: '3' },
]

interface TacticalToolbarProps {
  mapRef: RefObject<KonvaMapHandle | null>
  role: 'GM' | 'PL'
  tacticalInfo: TacticalInfo
}

export function TacticalToolbar({ mapRef, role, tacticalInfo }: TacticalToolbarProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const updateTacticalGrid = useWorldStore((s) => s.updateTacticalGrid)
  const gridConfigOpen = useUiStore((s) => s.gridConfigOpen)
  const toggleGridConfig = useUiStore((s) => s.toggleGridConfig)
  const setGridConfigOpen = useUiStore((s) => s.setGridConfigOpen)

  const isGM = role === 'GM'

  return (
    <div
      className="fixed top-3 z-toast pointer-events-auto"
      style={{ right: RIGHT_PANEL_WIDTH + 24 }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onWheel={(e) => {
        e.stopPropagation()
      }}
    >
      <div className="bg-glass backdrop-blur-[16px] rounded-xl border border-border-glass shadow-[0_4px_20px_rgba(0,0,0,0.3)] p-1.5 flex flex-col gap-0.5">
        {/* Tool selection group */}
        {TOOLS.map((tool) => (
          <ToolButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.id}
            onClick={() => {
              setActiveTool(tool.id)
            }}
          />
        ))}

        <Divider />

        {/* Canvas controls group */}
        {isGM && (
          <ToolButton
            icon={Grid3X3}
            label="Grid"
            shortcut="G"
            active={gridConfigOpen}
            onClick={() => {
              toggleGridConfig()
            }}
          />
        )}

        <Divider />

        {/* Zoom controls group */}
        <ToolButton
          icon={ZoomIn}
          label="Zoom In"
          shortcut="+"
          onClick={() => {
            mapRef.current?.zoomIn()
          }}
        />
        <ToolButton
          icon={ZoomOut}
          label="Zoom Out"
          shortcut="-"
          onClick={() => {
            mapRef.current?.zoomOut()
          }}
        />
        <ToolButton
          icon={Maximize}
          label="Fit Window"
          shortcut="F"
          onClick={() => {
            mapRef.current?.fitToWindow()
          }}
        />
        <ToolButton
          icon={LocateFixed}
          label="Reset Center"
          shortcut="0"
          onClick={() => {
            mapRef.current?.resetCenter()
          }}
        />
      </div>

      {/* GridConfigPanel popover — anchored to toolbar left */}
      {gridConfigOpen && isGM && (
        <GridConfigPanel
          tacticalInfo={tacticalInfo}
          onUpdateGrid={(updates) => {
            void updateTacticalGrid(updates)
          }}
          onClose={() => {
            setGridConfigOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ── Internal components ──

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active = false,
  onClick,
}: {
  icon: React.ElementType
  label: string
  shortcut: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} (${shortcut})`}
      aria-label={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors duration-fast border ${
        active
          ? 'bg-accent/15 text-accent border-accent/25'
          : 'bg-transparent text-text-muted border-transparent hover:bg-hover hover:text-text-primary'
      }`}
    >
      <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
    </button>
  )
}

function Divider() {
  return <div className="w-5 h-px bg-border-glass mx-auto my-1" />
}
