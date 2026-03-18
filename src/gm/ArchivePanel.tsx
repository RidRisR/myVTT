import { useEffect, useState, useRef, useMemo } from 'react'
import { Plus, Download, Save, MoreVertical, Copy, Pencil, Trash2, Swords } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import { useWorldStore } from '../stores/worldStore'
import type { ArchiveRecord } from '../stores/worldStore'
import { selectIsTactical } from '../stores/selectors'
import { useToast } from '../ui/useToast'
import { DropdownMenuContent } from '../ui/primitives/DropdownMenuContent'
import { DropdownMenuItem } from '../ui/primitives/DropdownMenuItem'
import { ConfirmDropdownItem } from '../ui/ConfirmDropdownItem'
import { PopoverContent } from '../ui/primitives/PopoverContent'
import { useTranslation } from 'react-i18next'

export function ArchivePanel() {
  const { t } = useTranslation('gm')
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const archives = useWorldStore((s) => s.archives)
  const isTactical = useWorldStore(selectIsTactical)
  const fetchArchives = useWorldStore((s) => s.fetchArchives)
  const createArchive = useWorldStore((s) => s.createArchive)
  const deleteArchive = useWorldStore((s) => s.deleteArchive)
  const updateArchive = useWorldStore((s) => s.updateArchive)
  const duplicateArchive = useWorldStore((s) => s.duplicateArchive)
  const loadArchive = useWorldStore((s) => s.loadArchive)
  const saveArchive = useWorldStore((s) => s.saveArchive)

  const { toast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const renameInputRef = useRef<HTMLInputElement>(null)

  // Fetch archives when scene changes
  useEffect(() => {
    if (activeSceneId) {
      void fetchArchives(activeSceneId)
    }
  }, [activeSceneId, fetchArchives])

  // Auto-focus rename input
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const sortedArchives = useMemo(
    () => [...archives].sort((a, b) => a.name.localeCompare(b.name)),
    [archives],
  )

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      void updateArchive(renamingId, { name: renameValue.trim() })
    }
    setRenamingId(null)
  }

  const handleCreateAndSave = async () => {
    if (!activeSceneId) return
    const archive = await createArchive(
      activeSceneId,
      t('archive.default_name', { number: archives.length + 1 }),
    )
    if (archive) {
      await saveArchive(archive.id)
      toast('success', t('archive.saved_new'))
    }
  }

  const handleDelete = (archive: ArchiveRecord) => {
    // Optimistic removal from local state, delete on server
    void deleteArchive(archive.id)
    toast('undo', t('archive.deleted', { name: archive.name }), {
      duration: 5000,
    })
  }

  const handleLoad = () => {
    if (!loadingId) return
    void loadArchive(loadingId)
    setLoadingId(null)
    setSelectedId(null)
  }

  const handleSave = () => {
    if (!selectedId || !activeSceneId) return
    void saveArchive(selectedId)
    setSelectedId(null)
    toast('success', t('archive.overwritten'))
  }

  const selectedArchive = selectedId ? archives.find((e) => e.id === selectedId) : null
  const loadingArchive = loadingId ? archives.find((e) => e.id === loadingId) : null

  if (!activeSceneId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
        <Swords size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
        <span className="opacity-50">{t('archive.no_scene')}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Archive list */}
      <div className="flex-1 overflow-y-auto">
        {sortedArchives.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs py-8">
            <Swords size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
            <span className="opacity-50">{t('archive.empty')}</span>
            <span className="opacity-30 text-[10px] mt-1">{t('archive.empty_hint')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedArchives.map((archive) => {
              const isSelected = archive.id === selectedId
              return (
                <div
                  key={archive.id}
                  onClick={() => {
                    setSelectedId(isSelected ? null : archive.id)
                  }}
                  className={`relative rounded-md px-2.5 py-2 cursor-pointer transition-colors duration-fast group ${
                    isSelected
                      ? 'bg-accent/15 border border-accent/30'
                      : 'hover:bg-surface/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Name or rename input */}
                    {renamingId === archive.id ? (
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
                        className="flex-1 text-xs bg-surface text-text-primary border border-border-glass rounded px-1.5 py-0.5 outline-none min-w-0"
                      />
                    ) : (
                      <span className="flex-1 text-xs text-text-primary truncate">
                        {archive.name}
                      </span>
                    )}

                    {/* Meta info */}
                    {archive.mapUrl && (
                      <span className="text-[10px] text-text-muted/50 shrink-0">🗺</span>
                    )}

                    {/* ⋮ Dropdown menu */}
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                          className="opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer transition-opacity duration-fast"
                        >
                          <MoreVertical size={12} strokeWidth={1.5} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenuContent align="end" sideOffset={4}>
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenamingId(archive.id)
                            setRenameValue(archive.name)
                          }}
                        >
                          <Pencil size={12} strokeWidth={1.5} />
                          {t('archive.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void duplicateArchive(archive.id)
                          }}
                        >
                          <Copy size={12} strokeWidth={1.5} />
                          {t('archive.duplicate')}
                        </DropdownMenuItem>
                        <DropdownMenu.Separator className="border-t border-border-glass my-1" />
                        <ConfirmDropdownItem
                          icon={<Trash2 size={12} strokeWidth={1.5} />}
                          message={t('archive.delete_confirm', { name: archive.name })}
                          onConfirm={() => {
                            handleDelete(archive)
                          }}
                        >
                          Delete
                        </ConfirmDropdownItem>
                      </DropdownMenuContent>
                    </DropdownMenu.Root>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border-glass px-2 py-2 flex items-center gap-1.5">
        {/* Create and save current state as new archive */}
        {isTactical && (
          <button
            data-testid="archive-save-new"
            onClick={() => void handleCreateAndSave()}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
            title={t('archive.save_new')}
          >
            <Plus size={12} strokeWidth={1.5} />
            {t('archive.save_new')}
          </button>
        )}

        <div className="flex-1" />

        {/* Overwrite selected archive with current state */}
        {isTactical && selectedId && (
          <button
            data-testid="archive-overwrite"
            onClick={handleSave}
            className="flex items-center gap-1 text-[11px] text-accent hover:text-accent-bold px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
            title={t('archive.overwrite_title')}
          >
            <Save size={12} strokeWidth={1.5} />
            {t('archive.overwrite')}
          </button>
        )}

        {/* Load from selected archive (with confirmation) */}
        {selectedArchive && (
          <Popover.Root
            open={loadingId !== null}
            onOpenChange={(open) => {
              if (!open) setLoadingId(null)
            }}
          >
            <Popover.Trigger asChild>
              <button
                data-testid="archive-load"
                onClick={() => {
                  setLoadingId(selectedId)
                }}
                className="flex items-center gap-1 text-[11px] text-white bg-accent/80 hover:bg-accent px-2.5 py-1 rounded cursor-pointer transition-colors duration-fast"
                title={t('archive.load_title')}
              >
                <Download size={14} strokeWidth={1.5} />
                {t('archive.load')}
              </button>
            </Popover.Trigger>
            {loadingArchive && (
              <PopoverContent side="top" align="center" className="min-w-[140px]">
                <p className="text-xs text-text-primary mb-2.5 whitespace-nowrap">
                  {t('archive.load_confirm', { name: loadingArchive.name })}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    data-testid="confirm-cancel"
                    onClick={() => {
                      setLoadingId(null)
                    }}
                    className="text-[11px] text-text-muted px-2 py-1 rounded hover:bg-hover cursor-pointer transition-colors duration-fast"
                  >
                    {t('cancel', { ns: 'ui' })}
                  </button>
                  <button
                    data-testid="confirm-action"
                    onClick={handleLoad}
                    className="text-[11px] text-white bg-danger px-2.5 py-1 rounded hover:bg-danger/80 cursor-pointer transition-colors duration-fast"
                  >
                    {t('confirm_default', { ns: 'ui' })}
                  </button>
                </div>
              </PopoverContent>
            )}
          </Popover.Root>
        )}
      </div>
    </div>
  )
}
