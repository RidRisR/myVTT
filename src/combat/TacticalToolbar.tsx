import { useState, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useUiStore, isMeasureTool, type MeasureTool } from '../stores/uiStore'
import { GridConfigPanel } from './tools/GridConfigPanel'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'

const ICON_SIZE = 16
const ICON_STROKE = 1.5

interface MeasureToolDef {
  id: MeasureTool
  icon: React.ElementType
  label: string
  shortcut: string
}

const MEASURE_LINE: MeasureToolDef = {
  id: 'measure',
  icon: Ruler,
  label: 'Measure',
  shortcut: 'M',
}

const MEASURE_TOOLS: MeasureToolDef[] = [
  MEASURE_LINE,
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
  const { t } = useTranslation('combat')
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
        {/* Select tool */}
        <ToolButton
          icon={MousePointer2}
          label={t('toolbar.select')}
          shortcut="V"
          active={activeTool === 'select'}
          onClick={() => {
            setActiveTool('select')
          }}
        />

        {/* Measure split button */}
        <MeasureSplitButton />

        <Divider />

        {/* Canvas controls group */}
        {isGM && (
          <ToolButton
            icon={Grid3X3}
            label={t('toolbar.grid')}
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
          label={t('toolbar.zoom_in')}
          shortcut="+"
          onClick={() => {
            mapRef.current?.zoomIn()
          }}
        />
        <ToolButton
          icon={ZoomOut}
          label={t('toolbar.zoom_out')}
          shortcut="-"
          onClick={() => {
            mapRef.current?.zoomOut()
          }}
        />
        <ToolButton
          icon={Maximize}
          label={t('toolbar.fit_window')}
          shortcut="F"
          onClick={() => {
            mapRef.current?.fitToWindow()
          }}
        />
        <ToolButton
          icon={LocateFixed}
          label={t('toolbar.reset_center')}
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

// ── Measure split button ──

function MeasureSplitButton() {
  const activeTool = useUiStore((s) => s.activeTool)
  const lastMeasureTool = useUiStore((s) => s.lastMeasureTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentDef = MEASURE_TOOLS.find((t) => t.id === lastMeasureTool) ?? MEASURE_LINE
  const isActive = isMeasureTool(activeTool)

  // Close flyout on click outside
  useEffect(() => {
    if (!flyoutOpen) return
    const handler = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setFlyoutOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
    }
  }, [flyoutOpen])

  // Close flyout when keyboard shortcut changes tool away from measure
  useEffect(() => {
    if (flyoutOpen && !isMeasureTool(activeTool)) {
      setFlyoutOpen(false)
    }
  }, [activeTool, flyoutOpen])

  const Icon = currentDef.icon

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setActiveTool(lastMeasureTool)
          setFlyoutOpen((prev) => !prev)
        }}
        title={`${currentDef.label} (${currentDef.shortcut})`}
        aria-label={currentDef.label}
        className={`relative w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors duration-fast border ${
          isActive
            ? 'bg-accent/15 text-accent border-accent/25'
            : 'bg-transparent text-text-muted border-transparent hover:bg-hover hover:text-text-primary'
        }`}
      >
        <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        {/* Expansion indicator — small triangle in bottom-right */}
        <svg
          className="absolute bottom-0.5 right-0.5 opacity-40"
          width="5"
          height="5"
          viewBox="0 0 5 5"
        >
          <polygon points="0,5 5,5 5,0" fill="currentColor" />
        </svg>
      </button>

      {/* Flyout panel — expands to the left */}
      {flyoutOpen && (
        <div className="absolute right-full top-0 mr-1.5 bg-glass backdrop-blur-[16px] rounded-lg border border-border-glass shadow-[0_4px_20px_rgba(0,0,0,0.3)] p-1 flex flex-col gap-0.5">
          {MEASURE_TOOLS.map((tool) => (
            <ToolButton
              key={tool.id}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.shortcut}
              active={activeTool === tool.id}
              onClick={() => {
                setActiveTool(tool.id)
                setFlyoutOpen(false)
              }}
            />
          ))}
        </div>
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
