import { useState, useEffect, useRef } from 'react'
import { Menu, LogOut, Sun, Moon } from 'lucide-react'
import { SEAT_COLORS, type Seat } from '../stores/identityStore'
import { uploadAsset } from '../shared/assetUpload'
import { useUiStore } from '../stores/uiStore'

interface HamburgerMenuProps {
  mySeat: Seat
  onUpdateSeat: (seatId: string, updates: Partial<Omit<Seat, 'id'>>) => void
  onLeaveSeat: () => void
}

export function HamburgerMenu({ mySeat, onUpdateSeat, onLeaveSeat }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(mySeat.name)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync editName when seat name changes externally
  useEffect(() => {
    setEditName(mySeat.name)
  }, [mySeat.name])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing) {
          setEditing(false)
          setEditName(mySeat.name)
        } else {
          setOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, editing, mySeat.name])

  const handlePortraitUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadAsset(file)
      onUpdateSeat(mySeat.id, { portraitUrl: result.url })
    } catch (err) {
      console.error('Portrait upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== mySeat.name) {
      onUpdateSeat(mySeat.id, { name: trimmed })
    }
    setEditing(false)
  }

  return (
    <div
      className="fixed top-3 left-4 z-toast font-sans"
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      <button
        onClick={() => {
          setOpen(!open)
        }}
        className={`p-2 rounded-lg backdrop-blur-[16px] border border-border-glass cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.25)] flex items-center transition-colors duration-fast ${
          open ? 'bg-surface' : 'bg-glass hover:bg-surface'
        }`}
      >
        <Menu size={16} strokeWidth={1.5} className="text-text-muted" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 -z-[1]"
            onClick={() => {
              setOpen(false)
              setEditing(false)
            }}
          />
          <div className="absolute top-full left-0 mt-1.5 bg-glass backdrop-blur-[16px] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-border-glass min-w-[220px] p-1.5 z-toast animate-fade-in">
            {/* Seat profile section */}
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                {/* Portrait — clickable to upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handlePortraitUpload(e)
                  }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative cursor-pointer shrink-0"
                  title="Click to change avatar"
                >
                  {mySeat.portraitUrl ? (
                    <img
                      src={mySeat.portraitUrl}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover block"
                      style={{ border: `2px solid ${mySeat.color}` }}
                    />
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: mySeat.color }}
                    >
                      {mySeat.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 rounded-full flex items-center justify-center transition-colors duration-fast text-[9px] text-white"
                    style={{
                      background: uploading ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
                    }}
                    onMouseEnter={(e) => {
                      if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0.4)'
                    }}
                    onMouseLeave={(e) => {
                      if (!uploading) e.currentTarget.style.background = 'rgba(0,0,0,0)'
                    }}
                  >
                    {uploading ? '...' : ''}
                  </div>
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value)
                      }}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') {
                          setEditing(false)
                          setEditName(mySeat.name)
                        }
                      }}
                      className="w-full px-1.5 py-0.5 border border-border-glass rounded-md text-[13px] font-semibold bg-surface text-text-primary outline-none"
                    />
                  ) : (
                    <div
                      onClick={() => {
                        setEditing(true)
                      }}
                      className="font-semibold text-[13px] text-text-primary overflow-hidden text-ellipsis whitespace-nowrap cursor-text"
                      title="Click to rename"
                    >
                      {mySeat.name}
                    </div>
                  )}
                  <div
                    className="text-[10px] font-medium mt-px"
                    style={{
                      color: mySeat.role === 'GM' ? '#fbbf24' : '#60a5fa',
                    }}
                  >
                    {mySeat.role === 'GM' ? 'Game Master' : 'Player'}
                  </div>
                </div>
              </div>

              {/* Color picker */}
              <div className="flex gap-1.5 mt-2.5 flex-wrap">
                {SEAT_COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => {
                      onUpdateSeat(mySeat.id, { color: c })
                    }}
                    className="w-[18px] h-[18px] rounded-full cursor-pointer transition-[border-color] duration-fast"
                    style={{
                      background: c,
                      border: c === mySeat.color ? '2px solid #fff' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-border-glass mx-2 my-0.5" />

            <ThemeToggle />

            <div className="h-px bg-border-glass mx-2 my-0.5" />

            <button
              onClick={() => {
                setOpen(false)
                onLeaveSeat()
              }}
              className="w-full px-3 py-2 bg-transparent border-none rounded-lg cursor-pointer text-xs text-danger font-medium text-left flex items-center gap-2 transition-colors duration-fast hover:bg-danger/10"
            >
              <LogOut size={14} strokeWidth={1.5} />
              Leave Seat
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const isWarm = theme === 'warm'

  return (
    <button
      onClick={() => {
        setTheme(isWarm ? 'cold' : 'warm')
      }}
      className="w-full px-3 py-2 bg-transparent border-none rounded-lg cursor-pointer text-xs text-text-muted font-medium text-left flex items-center gap-2 transition-colors duration-fast hover:bg-hover hover:text-text-primary"
    >
      {isWarm ? <Moon size={14} strokeWidth={1.5} /> : <Sun size={14} strokeWidth={1.5} />}
      {isWarm ? 'Cold Arcane' : 'Warm Alchemy'}
    </button>
  )
}
