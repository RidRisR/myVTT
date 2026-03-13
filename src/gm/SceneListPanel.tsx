import { useEffect, useRef, useState } from 'react'
import { X, Pencil, Copy, Plus, Trash2 } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'

interface SceneListPanelProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
  onEditScene: (sceneId: string) => void
  onDeleteScene: (sceneId: string) => void
  onRenameScene: (sceneId: string, name: string) => void
  onDuplicateScene: (sceneId: string) => void
  onCreateScene: () => void
  onClose: () => void
}

export function SceneListPanel({
  scenes,
  activeSceneId,
  onSelectScene,
  onEditScene,
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  onCreateScene,
  onClose,
}: SceneListPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

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

  // Auto-focus rename input
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameScene(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  const deletingScene = deletingId ? scenes.find((s) => s.id === deletingId) : null

  return (
    <div
      ref={panelRef}
      className="fixed z-toast bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex flex-col"
      style={{ bottom: 56, left: 16, width: 280, maxHeight: 420 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass">
        <span className="text-text-primary text-sm font-semibold">Scenes</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors duration-fast p-0.5 cursor-pointer"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1.5">
          {scenes.map((scene) => {
            const isActive = scene.id === activeSceneId
            return (
              <div
                key={scene.id}
                className={`relative rounded-lg overflow-hidden cursor-pointer transition-all duration-standard group ${
                  isActive
                    ? 'border-2 border-accent/40 opacity-100'
                    : 'border border-border-glass opacity-70 hover:opacity-100'
                }`}
                onClick={() => onSelectScene(scene.id)}
              >
                {/* Background image */}
                <div className="w-full h-16 bg-deep">
                  {scene.atmosphere.imageUrl ? (
                    isVideoUrl(scene.atmosphere.imageUrl) ? (
                      <video
                        src={scene.atmosphere.imageUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={scene.atmosphere.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full bg-surface" />
                  )}
                </div>

                {/* Gradient overlay with name and actions */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 py-1.5 flex items-center justify-between">
                  {renamingId === scene.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs bg-black/40 text-white border border-white/30 rounded px-1.5 py-0.5 outline-none w-full mr-1"
                    />
                  ) : (
                    <span
                      className={`text-xs truncate ${
                        isActive ? 'text-white font-semibold' : 'text-white/80'
                      }`}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setRenamingId(scene.id)
                        setRenameValue(scene.name || '')
                      }}
                      title="Double-click to rename"
                    >
                      {scene.name || 'Untitled'}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicateScene(scene.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white transition-all duration-fast p-1 cursor-pointer"
                      title="Duplicate scene"
                    >
                      <Copy size={12} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditScene(scene.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white transition-all duration-fast p-1 cursor-pointer"
                      title="Edit scene"
                    >
                      <Pencil size={12} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeletingId(scene.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-danger transition-all duration-fast p-1 cursor-pointer"
                      title="Delete scene"
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Create new scene card */}
          <div
            className="h-9 rounded-lg border border-dashed border-border-glass flex items-center justify-center gap-1.5 cursor-pointer text-text-muted hover:text-text-primary hover:border-accent/30 transition-colors duration-fast"
            onClick={onCreateScene}
          >
            <Plus size={14} strokeWidth={1.5} />
            <span className="text-xs">New Scene</span>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {deletingScene && (
        <ConfirmDialog
          title="Delete Scene"
          message={`Are you sure you want to delete "${deletingScene.name || 'Untitled'}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            onDeleteScene(deletingScene.id)
            setDeletingId(null)
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  )
}
