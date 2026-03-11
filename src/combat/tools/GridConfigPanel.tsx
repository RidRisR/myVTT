import { useEffect, useRef, useState, useCallback } from 'react'
import type { Scene } from '../../stores/worldStore'

/** Bottom offset so GridConfigPanel clears the dual-row GmToolbar (~68px) + 4px gap */
const GM_TOOLBAR_HEIGHT = 72

interface GridConfigPanelProps {
  scene: Scene
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void
  onClose: () => void
}

export function GridConfigPanel({ scene, onUpdateScene, onClose }: GridConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Local state synced from scene props
  const [gridSize, setGridSize] = useState(scene.gridSize)
  const [gridOffsetX, setGridOffsetX] = useState(scene.gridOffsetX)
  const [gridOffsetY, setGridOffsetY] = useState(scene.gridOffsetY)
  const [gridColor, setGridColor] = useState(scene.gridColor)

  // Re-sync local state when scene changes externally
  useEffect(() => {
    setGridSize(scene.gridSize)
    setGridOffsetX(scene.gridOffsetX)
    setGridOffsetY(scene.gridOffsetY)
    setGridColor(scene.gridColor)
  }, [scene.gridSize, scene.gridOffsetX, scene.gridOffsetY, scene.gridColor])

  // Click outside to close
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const commitChange = useCallback(
    (updates: Partial<Scene>) => {
      onUpdateScene(scene.id, updates)
    },
    [scene.id, onUpdateScene],
  )

  return (
    <div
      ref={panelRef}
      className="fixed left-3 w-[200px] p-3 z-popover bg-glass backdrop-blur-[12px] border border-border-glass rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      style={{ bottom: GM_TOOLBAR_HEIGHT }}
    >
      <div className="text-text-primary text-xs font-medium mb-3">Grid Settings</div>

      <FieldRow label="Cell Size" htmlFor="grid-cell-size">
        <NumberInput
          id="grid-cell-size"
          value={gridSize}
          min={10}
          max={500}
          onChange={(v) => {
            setGridSize(v)
            commitChange({ gridSize: v })
          }}
        />
      </FieldRow>

      <FieldRow label="Offset X" htmlFor="grid-offset-x">
        <NumberInput
          id="grid-offset-x"
          value={gridOffsetX}
          min={-500}
          max={500}
          onChange={(v) => {
            setGridOffsetX(v)
            commitChange({ gridOffsetX: v })
          }}
        />
      </FieldRow>

      <FieldRow label="Offset Y" htmlFor="grid-offset-y">
        <NumberInput
          id="grid-offset-y"
          value={gridOffsetY}
          min={-500}
          max={500}
          onChange={(v) => {
            setGridOffsetY(v)
            commitChange({ gridOffsetY: v })
          }}
        />
      </FieldRow>

      <FieldRow label="Color" htmlFor="grid-color">
        <input
          id="grid-color"
          type="color"
          value={gridColor}
          onChange={(e) => {
            setGridColor(e.target.value)
            commitChange({ gridColor: e.target.value })
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
