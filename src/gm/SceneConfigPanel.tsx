import { useState, useEffect, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Scene } from '../yjs/useScenes'

interface SceneConfigPanelProps {
  scene: Scene
  onUpdateScene: (id: string, updates: Partial<Scene>) => void
  onDeleteScene: (id: string) => void
  onClose: () => void
}

const PARTICLE_PRESETS = ['none', 'embers', 'snow', 'dust', 'rain', 'fireflies'] as const

export function SceneConfigPanel({
  scene,
  onUpdateScene,
  onDeleteScene,
  onClose,
}: SceneConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState(scene.name)
  const [particlePreset, setParticlePreset] = useState(scene.particlePreset)
  const [gridVisible, setGridVisible] = useState(scene.gridVisible)
  const [gridSize, setGridSize] = useState(scene.gridSize)
  const [gridSnap, setGridSnap] = useState(scene.gridSnap)
  const [gridColor, setGridColor] = useState(scene.gridColor)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset form when scene changes
  useEffect(() => {
    setName(scene.name)
    setParticlePreset(scene.particlePreset)
    setGridVisible(scene.gridVisible)
    setGridSize(scene.gridSize)
    setGridSnap(scene.gridSnap)
    setGridColor(scene.gridColor)
    setConfirmDelete(false)
  }, [
    scene.id,
    scene.name,
    scene.particlePreset,
    scene.gridVisible,
    scene.gridSize,
    scene.gridSnap,
    scene.gridColor,
  ])

  // Click-outside-to-close
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  const handleSave = () => {
    onUpdateScene(scene.id, {
      name: name.trim() || 'Untitled',
      particlePreset,
      gridVisible,
      gridSize,
      gridSnap,
      gridColor,
    })
    onClose()
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDeleteScene(scene.id)
    onClose()
  }

  const inputClass =
    'w-full bg-surface text-text-primary text-xs rounded px-2 py-1.5 border border-border-glass focus:border-accent focus:outline-none transition-colors duration-fast'

  const labelClass = 'text-text-muted text-xs font-medium'

  return (
    <div
      ref={panelRef}
      className="fixed z-toast bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex flex-col"
      style={{ bottom: 56, left: 286, width: 300, maxHeight: 520 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass">
        <span className="text-text-primary text-sm font-semibold">Scene Settings</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors duration-fast p-0.5 cursor-pointer"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Scene name */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Scene name"
          />
        </div>

        {/* Atmosphere image (read-only) */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Atmosphere Image</label>
          <div className="text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
            {scene.atmosphereImageUrl || 'None — set via asset dock'}
          </div>
        </div>

        {/* Tactical map (read-only) */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Tactical Map</label>
          <div className="text-text-muted text-xs bg-surface rounded px-2 py-1.5 border border-border-glass truncate">
            {scene.tacticalMapImageUrl || 'None — set via asset dock'}
          </div>
        </div>

        {/* Particle preset */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Particle Effect</label>
          <select
            value={particlePreset}
            onChange={(e) => setParticlePreset(e.target.value)}
            className={inputClass}
          >
            {PARTICLE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Grid settings section */}
        <div className="flex flex-col gap-2">
          <span className="text-text-muted text-xs font-semibold uppercase tracking-wide">
            Grid
          </span>

          {/* Grid visible toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className={labelClass}>Visible</span>
            <button
              type="button"
              onClick={() => setGridVisible(!gridVisible)}
              className={`w-8 h-4.5 rounded-full transition-colors duration-fast cursor-pointer ${
                gridVisible ? 'bg-accent' : 'bg-surface border border-border-glass'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-text-primary transition-transform duration-fast ${
                  gridVisible ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          {/* Grid size */}
          <div className="flex items-center justify-between gap-2">
            <label className={labelClass}>Size (px)</label>
            <input
              type="number"
              value={gridSize}
              onChange={(e) => setGridSize(Math.max(10, parseInt(e.target.value) || 10))}
              className="w-20 bg-surface text-text-primary text-xs rounded px-2 py-1.5 border border-border-glass focus:border-accent focus:outline-none transition-colors duration-fast"
              min={10}
              max={500}
            />
          </div>

          {/* Grid snap toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className={labelClass}>Snap to Grid</span>
            <button
              type="button"
              onClick={() => setGridSnap(!gridSnap)}
              className={`w-8 h-4.5 rounded-full transition-colors duration-fast cursor-pointer ${
                gridSnap ? 'bg-accent' : 'bg-surface border border-border-glass'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-text-primary transition-transform duration-fast ${
                  gridSnap ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          {/* Grid color */}
          <div className="flex items-center justify-between gap-2">
            <label className={labelClass}>Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={gridColor.startsWith('rgba') ? '#ffffff' : gridColor}
                onChange={(e) => setGridColor(e.target.value)}
                className="w-6 h-6 rounded border border-border-glass cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={gridColor}
                onChange={(e) => setGridColor(e.target.value)}
                className="w-28 bg-surface text-text-primary text-xs rounded px-2 py-1.5 border border-border-glass focus:border-accent focus:outline-none transition-colors duration-fast"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border-glass">
        {/* Delete button */}
        <button
          onClick={handleDelete}
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded transition-colors duration-fast cursor-pointer ${
            confirmDelete ? 'bg-danger text-text-primary' : 'text-danger hover:bg-danger/15'
          }`}
        >
          <Trash2 size={14} strokeWidth={1.5} />
          {confirmDelete ? 'Confirm Delete' : 'Delete'}
        </button>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="bg-accent hover:bg-accent-bold text-deep text-xs font-semibold px-4 py-1.5 rounded transition-colors duration-fast cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  )
}
