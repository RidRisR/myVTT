import { useEffect, useRef, useState, useCallback } from 'react'
import type { Scene } from '../../stores/worldStore'

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
      className="bg-glass backdrop-blur-[12px] border border-border-glass rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      style={{
        position: 'absolute',
        left: 48,
        top: 8,
        width: 200,
        zIndex: 20,
        padding: '12px',
      }}
    >
      <div className="text-text-primary text-xs font-medium mb-3">Grid Settings</div>

      <FieldRow label="Cell Size">
        <NumberInput
          value={gridSize}
          min={10}
          max={500}
          onChange={(v) => {
            setGridSize(v)
            commitChange({ gridSize: v })
          }}
        />
      </FieldRow>

      <FieldRow label="Offset X">
        <NumberInput
          value={gridOffsetX}
          min={-500}
          max={500}
          onChange={(v) => {
            setGridOffsetX(v)
            commitChange({ gridOffsetX: v })
          }}
        />
      </FieldRow>

      <FieldRow label="Offset Y">
        <NumberInput
          value={gridOffsetY}
          min={-500}
          max={500}
          onChange={(v) => {
            setGridOffsetY(v)
            commitChange({ gridOffsetY: v })
          }}
        />
      </FieldRow>

      <FieldRow label="Color">
        <input
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-text-muted text-xs">{label}</span>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <input
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
