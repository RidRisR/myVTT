import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Copy, Plus, Trash2 } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import type { Scene } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { PopoverContent } from '../ui/primitives/PopoverContent'
import { useClickOutside } from '../hooks/useClickOutside'

interface SceneListPanelProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (sceneId: string) => void
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
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  onCreateScene,
  onClose,
}: SceneListPanelProps) {
  const { t } = useTranslation('gm')
  const panelRef = useRef<HTMLDivElement>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Click-outside-to-close (Radix Portal-aware)
  useClickOutside(panelRef, onClose)

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

  return (
    <div
      ref={panelRef}
      className="fixed z-ui bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex flex-col"
      style={{ bottom: 56, left: 16, width: 280, maxHeight: 420 }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-glass">
        <span className="text-text-primary text-sm font-semibold" data-testid="scene-panel-header">
          {t('scene.scenes')}
        </span>
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
                onClick={() => {
                  onSelectScene(scene.id)
                }}
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
                      onChange={(e) => {
                        setRenameValue(e.target.value)
                      }}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
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
                      title={t('scene.rename_hint')}
                    >
                      {scene.name || t('scene.untitled')}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicateScene(scene.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white transition-all duration-fast p-1 cursor-pointer"
                      title={t('scene.duplicate')}
                    >
                      <Copy size={12} strokeWidth={1.5} />
                    </button>
                    {scenes.length > 1 && (
                      <Popover.Root
                        open={deletingId === scene.id}
                        onOpenChange={(open) => {
                          if (!open) setDeletingId(null)
                        }}
                      >
                        <Popover.Trigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletingId(scene.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-danger transition-all duration-fast p-1 cursor-pointer"
                            title={t('scene.delete')}
                          >
                            <Trash2 size={12} strokeWidth={1.5} />
                          </button>
                        </Popover.Trigger>
                        <PopoverContent side="top" align="center" className="min-w-[140px]">
                          <p className="text-xs text-text-primary mb-2.5 whitespace-nowrap">
                            {t('archive.delete_confirm', {
                              name: scene.name || t('scene.untitled'),
                            })}
                          </p>
                          <div className="flex justify-end gap-2">
                            <button
                              data-testid="confirm-cancel"
                              onClick={() => {
                                setDeletingId(null)
                              }}
                              className="text-[11px] text-text-muted px-2 py-1 rounded hover:bg-hover cursor-pointer transition-colors duration-fast"
                            >
                              {t('cancel', { ns: 'ui' })}
                            </button>
                            <button
                              data-testid="confirm-action"
                              onClick={() => {
                                onDeleteScene(scene.id)
                                setDeletingId(null)
                              }}
                              className="text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast"
                            >
                              {t('delete_default', { ns: 'ui' })}
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover.Root>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Create new scene card */}
          <div
            className="h-9 rounded-lg border border-dashed border-border-glass flex items-center justify-center gap-1.5 cursor-pointer text-text-muted hover:text-text-primary hover:border-accent/30 transition-colors duration-fast"
            data-testid="create-scene-btn"
            onClick={onCreateScene}
          >
            <Plus size={14} strokeWidth={1.5} />
            <span className="text-xs">{t('scene.new_scene')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
