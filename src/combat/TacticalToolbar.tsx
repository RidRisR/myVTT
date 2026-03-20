import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ZoomIn, ZoomOut, Maximize, LocateFixed, Pin, PinOff } from 'lucide-react'
import type { KonvaMapHandle } from './KonvaMap'
import type { TacticalInfo } from '../stores/worldStore'
import { useWorldStore } from '../stores/worldStore'
import { useUiStore, isMeasureTool } from '../stores/uiStore'
import { toolRegistry } from './tools/toolRegistry'
import { BuiltinToolId } from './tools/builtinToolIds'
import './tools/registerBuiltinTools'
import { GridConfigPanel } from './tools/GridConfigPanel'
import { useClickOutside } from '../hooks/useClickOutside'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'

const ICON_SIZE = 16
const ICON_STROKE = 1.5

interface TacticalToolbarProps {
  mapRef: RefObject<KonvaMapHandle | null>
  role: 'GM' | 'PL'
  tacticalInfo: TacticalInfo
}

export function TacticalToolbar({ mapRef, role, tacticalInfo }: TacticalToolbarProps) {
  const { t } = useTranslation('combat')
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const toolPersist = useUiStore((s) => s.toolPersist)
  const toggleToolPersist = useUiStore((s) => s.toggleToolPersist)
  const updateTacticalGrid = useWorldStore((s) => s.updateTacticalGrid)
  const gridConfigOpen = useUiStore((s) => s.gridConfigOpen)
  const toggleGridConfig = useUiStore((s) => s.toggleGridConfig)
  const setGridConfigOpen = useUiStore((s) => s.setGridConfigOpen)

  const isGM = role === 'GM'

  return (
    <div
      className="fixed top-3 z-ui pointer-events-auto"
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
        {(() => {
          const selectDef = toolRegistry.get(BuiltinToolId.Select)
          if (!selectDef) return null
          const SelectIcon = selectDef.icon
          return (
            <ToolButton
              icon={SelectIcon}
              label={t(selectDef.label)}
              shortcut={selectDef.shortcut ?? 'V'}
              active={activeTool === BuiltinToolId.Select}
              onClick={() => {
                setActiveTool(BuiltinToolId.Select)
              }}
            />
          )
        })()}

        {/* Measure split button */}
        <MeasureSplitButton />

        {/* Persist toggle — only shown when a one-shot tool is active */}
        {toolRegistry.get(activeTool)?.defaultMode === 'one-shot' && (
          <ToolButton
            icon={toolPersist ? Pin : PinOff}
            label={toolPersist ? t('toolbar.persist_on') : t('toolbar.persist_off')}
            shortcut=""
            active={toolPersist}
            onClick={toggleToolPersist}
          />
        )}

        <Divider />

        {/* Canvas controls group */}
        {isGM &&
          (() => {
            const gridDef = toolRegistry.get(BuiltinToolId.GridConfig)
            if (!gridDef) return null
            const GridIcon = gridDef.icon
            return (
              <ToolButton
                icon={GridIcon}
                label={t(gridDef.label)}
                shortcut={gridDef.shortcut ?? 'G'}
                active={gridConfigOpen}
                onClick={() => {
                  toggleGridConfig()
                }}
              />
            )
          })()}

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
  const { t } = useTranslation('combat')

  const measureTools = // Registry is static — compute once
    useMemo(() => toolRegistry.getByCategory('measurement'), [])
  const currentDef = toolRegistry.get(lastMeasureTool) ?? measureTools[0]
  const isActive = isMeasureTool(activeTool)

  // Close flyout on click outside (Radix Portal-aware)
  const closeFlyout = useCallback(() => {
    setFlyoutOpen(false)
  }, [])
  useClickOutside(containerRef, closeFlyout, flyoutOpen)

  // Close flyout when keyboard shortcut changes tool away from measure
  useEffect(() => {
    if (flyoutOpen && !isMeasureTool(activeTool)) {
      setFlyoutOpen(false)
    }
  }, [activeTool, flyoutOpen])

  if (!currentDef) return null
  const Icon = currentDef.icon

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setActiveTool(lastMeasureTool)
          setFlyoutOpen((prev) => !prev)
        }}
        title={`${t(currentDef.label)} (${currentDef.shortcut ?? ''})`}
        aria-label={t(currentDef.label)}
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
          {measureTools.map((tool) => (
            <ToolButton
              key={tool.id}
              icon={tool.icon}
              label={t(tool.label)}
              shortcut={tool.shortcut ?? ''}
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
