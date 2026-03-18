import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { TacticalInfo } from '../../stores/worldStore'
import { useClickOutside } from '../../hooks/useClickOutside'

/** Toolbar button width + padding + gap so panel clears the toolbar pill */
const TOOLBAR_OFFSET = 48

interface GridConfigPanelProps {
  tacticalInfo: TacticalInfo
  onUpdateGrid: (updates: Partial<TacticalInfo['grid']>) => void
  onClose: () => void
}

export function GridConfigPanel({ tacticalInfo, onUpdateGrid, onClose }: GridConfigPanelProps) {
  const { t } = useTranslation('combat')
  const panelRef = useRef<HTMLDivElement>(null)

  // Local state synced from tacticalInfo props
  const [gridSize, setGridSize] = useState(tacticalInfo.grid.size)
  const [gridOffsetX, setGridOffsetX] = useState(tacticalInfo.grid.offsetX)
  const [gridOffsetY, setGridOffsetY] = useState(tacticalInfo.grid.offsetY)
  const [gridColor, setGridColor] = useState(tacticalInfo.grid.color)

  // Re-sync local state when tacticalInfo changes externally
  useEffect(() => {
    setGridSize(tacticalInfo.grid.size)
    setGridOffsetX(tacticalInfo.grid.offsetX)
    setGridOffsetY(tacticalInfo.grid.offsetY)
    setGridColor(tacticalInfo.grid.color)
  }, [
    tacticalInfo.grid.size,
    tacticalInfo.grid.offsetX,
    tacticalInfo.grid.offsetY,
    tacticalInfo.grid.color,
  ])

  // Click outside to close (Radix Portal-aware)
  useClickOutside(panelRef, onClose)

  const commitChange = useCallback(
    (updates: Partial<TacticalInfo['grid']>) => {
      onUpdateGrid(updates)
    },
    [onUpdateGrid],
  )

  return (
    <div
      ref={panelRef}
      className="absolute top-0 w-[200px] p-3 z-popover bg-glass backdrop-blur-[12px] border border-border-glass rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      style={{ right: TOOLBAR_OFFSET }}
    >
      <div className="text-text-primary text-xs font-medium mb-3">{t('grid.settings')}</div>

      <FieldRow label={t('grid.cell_size')} htmlFor="grid-cell-size">
        <NumberInput
          id="grid-cell-size"
          value={gridSize}
          min={10}
          max={500}
          onChange={(v) => {
            setGridSize(v)
            commitChange({ size: v })
          }}
        />
      </FieldRow>

      <FieldRow label={t('grid.offset_x')} htmlFor="grid-offset-x">
        <NumberInput
          id="grid-offset-x"
          value={gridOffsetX}
          min={-500}
          max={500}
          onChange={(v) => {
            setGridOffsetX(v)
            commitChange({ offsetX: v })
          }}
        />
      </FieldRow>

      <FieldRow label={t('grid.offset_y')} htmlFor="grid-offset-y">
        <NumberInput
          id="grid-offset-y"
          value={gridOffsetY}
          min={-500}
          max={500}
          onChange={(v) => {
            setGridOffsetY(v)
            commitChange({ offsetY: v })
          }}
        />
      </FieldRow>

      <FieldRow label={t('grid.color')} htmlFor="grid-color">
        <input
          id="grid-color"
          type="color"
          value={gridColor}
          onChange={(e) => {
            setGridColor(e.target.value)
            commitChange({ color: e.target.value })
          }}
          className="w-8 h-6 p-0 border border-border-glass rounded cursor-pointer bg-transparent"
        />
      </FieldRow>
    </div>
  )
}

// ── Helpers ──

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <label htmlFor={htmlFor} className="text-text-muted text-xs">
        {label}
      </label>
      {children}
    </div>
  )
}

function NumberInput({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <input
      id={id}
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10)
        if (!isNaN(v) && v >= min && v <= max) {
          onChange(v)
        }
      }}
      className="w-16 px-1.5 py-0.5 text-xs text-text-primary bg-deep border border-border-glass rounded text-right"
    />
  )
}
