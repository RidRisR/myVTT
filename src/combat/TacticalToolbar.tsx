import {
  MousePointer2,
  Ruler,
  Circle,
  Grid3x3,
  Settings,
  ChevronRight,
  X,
} from 'lucide-react'
import { useUiStore, type ActiveTool } from '../stores/uiStore'

interface TacticalToolbarProps {
  gridVisible: boolean
  gridSnap: boolean
  showGridConfig: boolean
  onToggleGridConfig: () => void
  onToggleGrid: () => void
  onAdvanceInitiative: () => void
  onClose: () => void
}

type RangeSubTool = 'range-circle' | 'range-cone' | 'range-rect'
const RANGE_TOOLS: RangeSubTool[] = ['range-circle', 'range-cone', 'range-rect']

function isRangeTool(tool: ActiveTool): tool is RangeSubTool {
  return RANGE_TOOLS.includes(tool as RangeSubTool)
}

export function TacticalToolbar({
  gridVisible,
  showGridConfig,
  onToggleGridConfig,
  onToggleGrid,
  onAdvanceInitiative,
  onClose,
}: TacticalToolbarProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)

  return (
    <div
      className="bg-glass backdrop-blur-[12px] border-r border-border-glass flex flex-col items-center py-2 gap-0.5 shrink-0"
      style={{ width: 40 }}
    >
      {/* Tool group: Select / Measure / Range */}
      <ToolButton
        icon={<MousePointer2 size={18} strokeWidth={1.5} />}
        active={activeTool === 'select'}
        title="Select / Move"
        onClick={() => setActiveTool('select')}
      />
      <ToolButton
        icon={<Ruler size={18} strokeWidth={1.5} />}
        active={activeTool === 'measure'}
        title="Measure distance"
        onClick={() => setActiveTool('measure')}
      />
      <RangeButton
        activeTool={activeTool}
        onSelect={setActiveTool}
      />

      {/* Divider */}
      <div className="w-6 h-px bg-border-glass my-1" />

      {/* Grid group */}
      <ToolButton
        icon={<Grid3x3 size={18} strokeWidth={1.5} />}
        active={gridVisible}
        title="Toggle grid"
        onClick={onToggleGrid}
      />
      <ToolButton
        icon={<Settings size={18} strokeWidth={1.5} />}
        active={showGridConfig}
        title="Grid settings"
        onClick={onToggleGridConfig}
      />

      {/* Divider */}
      <div className="w-6 h-px bg-border-glass my-1" />

      {/* Action group */}
      <ToolButton
        icon={<ChevronRight size={18} strokeWidth={1.5} />}
        active={false}
        title="Next turn"
        onClick={onAdvanceInitiative}
      />
      <ToolButton
        icon={<X size={18} strokeWidth={1.5} />}
        active={false}
        title="Close map"
        onClick={onClose}
      />
    </div>
  )
}

// ── Tool Button ──

function ToolButton({
  icon,
  active,
  title,
  onClick,
}: {
  icon: React.ReactNode
  active: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        w-8 h-8 flex items-center justify-center rounded cursor-pointer
        border-none transition-colors duration-fast
        ${active ? 'bg-accent text-deep' : 'bg-transparent text-text-muted hover:text-text-primary hover:bg-hover'}
      `}
    >
      {icon}
    </button>
  )
}

// ── Range Button with sub-menu ──

const RANGE_LABELS: Record<RangeSubTool, string> = {
  'range-circle': 'Circle',
  'range-cone': 'Cone',
  'range-rect': 'Rectangle',
}

function RangeButton({
  activeTool,
  onSelect,
}: {
  activeTool: ActiveTool
  onSelect: (tool: ActiveTool) => void
}) {
  const isActive = isRangeTool(activeTool)

  return (
    <div className="relative group">
      <ToolButton
        icon={<Circle size={18} strokeWidth={1.5} />}
        active={isActive}
        title="Range templates"
        onClick={() => {
          // Toggle: if already a range tool, cycle; otherwise default to circle
          if (isActive) {
            onSelect('select')
          } else {
            onSelect('range-circle')
          }
        }}
      />
      {/* Sub-menu on hover */}
      <div
        className="
          absolute left-full top-0 ml-1 hidden group-hover:flex flex-col
          bg-glass backdrop-blur-[12px] border border-border-glass rounded
          py-1 z-10 min-w-[100px]
        "
      >
        {RANGE_TOOLS.map((tool) => (
          <button
            key={tool}
            onClick={() => onSelect(tool)}
            className={`
              px-3 py-1.5 text-xs text-left border-none cursor-pointer
              transition-colors duration-fast
              ${activeTool === tool ? 'bg-accent text-deep' : 'bg-transparent text-text-muted hover:text-text-primary hover:bg-hover'}
            `}
          >
            {RANGE_LABELS[tool]}
          </button>
        ))}
      </div>
    </div>
  )
}
