import { useState, useEffect } from 'react'
import { Plus, Link, Trash2, Dices } from 'lucide-react'
import { io } from 'socket.io-client'
import { API_BASE } from '../shared/config'
import type { ServerToClientEvents, ClientToServerEvents } from '../shared/socketEvents'
import type { Socket } from 'socket.io-client'
import { getAvailablePlugins } from '../rules/registry'
import { generateRoomName } from './randomRoomName'
import { relativeTime } from './relativeTime'

interface RoomMeta {
  id: string
  name: string
  createdAt: number
  ruleSystemId?: string
  onlineColors?: string[]
}

type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const AVAILABLE_SYSTEMS = getAvailablePlugins()

const SYSTEM_LABELS: Record<string, string> = Object.fromEntries(
  AVAILABLE_SYSTEMS.map((s) => [s.id, s.name]),
)

export function AdminPanel() {
  const [rooms, setRooms] = useState<RoomMeta[]>([])
  const [newName, setNewName] = useState('')
  const [newSystemId, setNewSystemId] = useState('generic')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const socket: AdminSocket = io(API_BASE || window.location.origin)

    // On connect (and every reconnect), request a fresh full snapshot
    socket.on('connect', () => {
      socket.emit('join:admin')
    })

    socket.on('admin:snapshot', (snapshot) => {
      setRooms(snapshot)
      setLoading(false)
    })

    socket.on('room:presence', ({ roomId, onlineColors }) => {
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, onlineColors } : r)))
    })

    socket.on('room:created', (room) => {
      setRooms((prev) => [room, ...prev])
    })

    socket.on('room:deleted', ({ id }) => {
      setRooms((prev) => prev.filter((r) => r.id !== id))
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const handleCreate = async () => {
    setError('')
    const name = newName.trim()
    if (!name) {
      setError('Room name is required')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ruleSystemId: newSystemId }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Create failed')
        return
      }
      setNewName('')
      setNewSystemId('generic')
      // room:created socket event will update the list
    } catch {
      setError('Network error')
    }
  }

  const handleDelete = async (roomId: string) => {
    if (!confirm(`Delete room "${roomId}"? This will permanently erase all data.`)) return
    try {
      await fetch(`${API_BASE}/api/rooms/${roomId}`, { method: 'DELETE' })
      // room:deleted socket event will update the list
    } catch {
      setError('Delete failed')
    }
  }

  const copyLink = (roomId: string) => {
    const url = `${location.origin}${location.pathname}#room=${roomId}`
    void navigator.clipboard.writeText(url)
  }

  return (
    <div className="min-h-screen bg-deep text-text-primary font-sans px-6 py-10">
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[22px] font-light">Room Management</h1>
          <a
            href="#"
            className="text-text-muted/40 text-xs hover:text-text-muted transition-colors duration-fast"
          >
            Back to Landing
          </a>
        </div>

        {/* Create room form */}
        <div className="bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl p-5 mb-6">
          <div className="text-[11px] font-semibold text-text-muted/40 tracking-wider uppercase mb-3">
            Create Room
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex flex-[1_1_200px] min-w-[140px]">
              <input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                }}
                placeholder="Room name"
                className="flex-1 px-3 py-2 border border-border-glass rounded-l-md text-[13px] bg-surface text-text-primary outline-none placeholder:text-text-muted/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate()
                }}
              />
              <button
                onClick={() => {
                  setNewName(generateRoomName())
                }}
                title="Random name"
                className="px-2.5 py-2 border border-l-0 border-border-glass rounded-r-md bg-surface text-text-muted/50 hover:text-accent transition-colors duration-fast cursor-pointer"
              >
                <Dices size={14} strokeWidth={1.5} />
              </button>
            </div>
            <select
              value={newSystemId}
              onChange={(e) => {
                setNewSystemId(e.target.value)
              }}
              className="px-3 py-2 border border-border-glass rounded-md text-[13px] bg-surface text-text-primary outline-none cursor-pointer"
            >
              {AVAILABLE_SYSTEMS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                void handleCreate()
              }}
              className="flex items-center gap-2 px-5 py-2 border-none rounded-md text-[13px] font-semibold cursor-pointer bg-accent text-deep transition-colors duration-fast hover:bg-accent-bold"
            >
              <Plus size={14} strokeWidth={2} />
              Create
            </button>
          </div>
          {error && <div className="text-danger text-xs mt-2">{error}</div>}
        </div>

        {/* Room list */}
        <div className="bg-glass backdrop-blur-[16px] border border-border-glass rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border-glass">
            <span className="text-[11px] font-semibold text-text-muted/40 tracking-wider uppercase">
              Rooms ({rooms.length})
            </span>
          </div>

          {loading && <div className="py-8 text-center text-text-muted/30">Loading...</div>}

          {!loading && rooms.length === 0 && (
            <div className="py-8 text-center text-text-muted/30 text-[13px]">
              No rooms yet. Create one above.
            </div>
          )}

          {rooms.map((room) => {
            const colors = room.onlineColors ?? []
            const systemLabel = SYSTEM_LABELS[room.ruleSystemId ?? 'generic'] ?? room.ruleSystemId
            return (
              <div
                key={room.id}
                className="flex items-center gap-3 px-5 py-3 border-b border-border-glass/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary truncate">
                      {room.name}
                    </span>
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-surface text-text-muted/50 border border-border-glass/30">
                      {systemLabel}
                    </span>
                    {colors.length > 0 && (
                      <span className="flex items-center gap-0.5 shrink-0">
                        {colors.map((c, i) => (
                          <span
                            key={i}
                            className="w-2 h-2 rounded-full"
                            style={{ background: c }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted/30 mt-0.5">
                    {relativeTime(room.createdAt)}
                  </div>
                </div>

                <a
                  href={`#room=${room.id}`}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-accent text-deep no-underline transition-colors duration-fast hover:bg-accent-bold"
                >
                  Enter
                </a>

                <button
                  onClick={() => {
                    copyLink(room.id)
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs cursor-pointer bg-transparent text-text-muted/40 border border-border-glass/30 transition-colors duration-fast hover:text-text-muted/70 hover:border-border-glass/50"
                >
                  <Link size={11} strokeWidth={1.5} />
                  Link
                </button>

                <button
                  onClick={() => {
                    void handleDelete(room.id)
                  }}
                  className="flex items-center p-1.5 rounded-md text-xs cursor-pointer bg-transparent text-text-muted/25 border-none transition-colors duration-fast hover:text-danger"
                  aria-label="Delete"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
