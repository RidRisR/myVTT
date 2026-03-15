import { useEffect, useState, useRef, useMemo } from 'react'
import { Plus, Play, Save, MoreVertical, Copy, Pencil, Trash2, Swords } from 'lucide-react'
import { useWorldStore } from '../stores/worldStore'
import type { ArchiveRecord } from '../stores/worldStore'
import { useToast } from '../shared/ui/useToast'
import { ConfirmPopover } from '../shared/ui/ConfirmPopover'

export function ArchivePanel() {
  const activeSceneId = useWorldStore((s) => s.room.activeSceneId)
  const activeArchiveId = useWorldStore((s) => s.room.activeArchiveId)
  const archives = useWorldStore((s) => s.archives)
  const isTactical = useWorldStore((s) => s.tacticalInfo !== null)
  const fetchArchives = useWorldStore((s) => s.fetchArchives)
  const createArchive = useWorldStore((s) => s.createArchive)
  const deleteArchive = useWorldStore((s) => s.deleteArchive)
  const updateArchive = useWorldStore((s) => s.updateArchive)
  const duplicateArchive = useWorldStore((s) => s.duplicateArchive)
  const loadArchive = useWorldStore((s) => s.loadArchive)
  const saveArchive = useWorldStore((s) => s.saveArchive)

  const { toast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)

  // Fetch archives when scene changes
  useEffect(() => {
    if (activeSceneId) {
      fetchArchives(activeSceneId)
    }
  }, [activeSceneId, fetchArchives])

  // Auto-focus rename input
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  // Close menu on click outside
  useEffect(() => {
    if (!menuId) return
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuId])

  const sortedArchives = useMemo(
    () => [...archives].sort((a, b) => a.name.localeCompare(b.name)),
    [archives],
  )

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      updateArchive(renamingId, { name: renameValue.trim() })
    }
    setRenamingId(null)
  }

  const handleCreate = () => {
    if (!activeSceneId) return
    createArchive(activeSceneId, `存档 ${archives.length + 1}`)
  }

  const handleDelete = (archive: ArchiveRecord) => {
    setDeletingId(null)
    setMenuId(null)
    // Optimistic removal from local state, delete on server
    deleteArchive(archive.id)
    toast('undo', `已删除"${archive.name}"`, {
      duration: 5000,
    })
  }

  const handleActivate = () => {
    if (!selectedId) return
    loadArchive(selectedId)
  }

  const handleSave = () => {
    if (!activeArchiveId || !activeSceneId) return
    saveArchive(activeArchiveId)
    toast('success', '已保存存档快照')
  }

  const selectedArchive = selectedId ? archives.find((e) => e.id === selectedId) : null
  const deletingArchive = deletingId ? archives.find((e) => e.id === deletingId) : null

  if (!activeSceneId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted text-xs">
        <Swords size={24} strokeWidth={1.5} className="mb-2 opacity-30" />
        <span className="opacity-50">请先选择场景</span>
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
            <span className="opacity-50">暂无战场存档</span>
            <span className="opacity-30 text-[10px] mt-1">点击下方「+」创建</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedArchives.map((archive) => {
              const isSelected = archive.id === selectedId
              const isActive = archive.id === activeArchiveId
              return (
                <div
                  key={archive.id}
                  onClick={() => setSelectedId(isSelected ? null : archive.id)}
                  className={`relative rounded-md px-2.5 py-2 cursor-pointer transition-colors duration-fast group ${
                    isSelected
                      ? 'bg-accent/15 border border-accent/30'
                      : 'hover:bg-surface/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Status indicator */}
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0 animate-pulse" />
                    )}

                    {/* Name or rename input */}
                    {renamingId === archive.id ? (
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

                    {/* Context menu button */}
                    <button
                      ref={deletingId === archive.id ? deleteButtonRef : undefined}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuId(menuId === archive.id ? null : archive.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-text-primary p-0.5 cursor-pointer transition-opacity duration-fast"
                    >
                      <MoreVertical size={12} strokeWidth={1.5} />
                    </button>
                  </div>

                  {/* Context menu dropdown */}
                  {menuId === archive.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-1 top-full mt-0.5 z-popover bg-surface border border-border-glass rounded-md shadow-lg py-1 min-w-[120px]"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingId(archive.id)
                          setRenameValue(archive.name)
                          setMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast"
                      >
                        <Pencil size={12} strokeWidth={1.5} />
                        重命名
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          duplicateArchive(archive.id)
                          setMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-hover cursor-pointer transition-colors duration-fast"
                      >
                        <Copy size={12} strokeWidth={1.5} />
                        复制
                      </button>
                      <div className="border-t border-border-glass my-1" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletingId(archive.id)
                          setMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-hover cursor-pointer transition-colors duration-fast"
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-border-glass px-2 py-2 flex items-center gap-1.5">
        {/* Create new */}
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
          title="新建存档"
        >
          <Plus size={12} strokeWidth={1.5} />
          新建
        </button>

        <div className="flex-1" />

        {/* Save snapshot (only when combat active with a named archive) */}
        {isTactical && activeArchiveId && !activeArchiveId.startsWith('adhoc-') && (
          <button
            onClick={handleSave}
            className="flex items-center gap-1 text-[11px] text-accent hover:text-accent-bold px-2 py-1 rounded hover:bg-surface/60 cursor-pointer transition-colors duration-fast"
            title="保存当前战斗状态到存档"
          >
            <Save size={12} strokeWidth={1.5} />
            保存
          </button>
        )}

        {/* Activate (only when an archive is selected and not already active) */}
        {selectedArchive && selectedId !== activeArchiveId && (
          <button
            onClick={handleActivate}
            className="flex items-center gap-1 text-[11px] text-white bg-accent/80 hover:bg-accent px-2.5 py-1 rounded cursor-pointer transition-colors duration-fast"
            title="激活存档"
          >
            <Play size={10} strokeWidth={2} />
            激活
          </button>
        )}
      </div>

      {/* Delete confirmation popover */}
      {deletingArchive && (
        <ConfirmPopover
          anchorRef={deleteButtonRef}
          message={`删除"${deletingArchive.name}"？`}
          onConfirm={() => handleDelete(deletingArchive)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  )
}
