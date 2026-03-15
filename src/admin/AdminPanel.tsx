import { useState, useEffect, useCallback } from 'react'
import { Plus, Link, Trash2 } from 'lucide-react'
import { API_BASE } from '../shared/config'
import { getAvailablePlugins } from '../rules/registry'

interface RoomMeta {
  id: string
  name: string
  createdAt: number
}

const AVAILABLE_SYSTEMS = getAvailablePlugins()

export function AdminPanel() {
  const [rooms, setRooms] = useState<RoomMeta[]>([])
  const [newName, setNewName] = useState('')
  const [newSystemId, setNewSystemId] = useState('generic')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`)
      setRooms(await res.json())
    } catch {
      setError('Failed to fetch rooms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

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
        const body = await res.json()
        setError(body.error || 'Create failed')
        return
      }
      setNewName('')
      setNewSystemId('generic')
      fetchRooms()
    } catch {
      setError('Network error')
    }
  }

  const handleDelete = async (roomId: string) => {
    if (!confirm(`Delete room "${roomId}"? This will permanently erase all data.`)) return
    try {
      await fetch(`${API_BASE}/api/rooms/${roomId}`, { method: 'DELETE' })
      fetchRooms()
    } catch {
      setError('Delete failed')
    }
  }

  const copyLink = (roomId: string) => {
    const url = `${location.origin}${location.pathname}#room=${roomId}`
    navigator.clipboard.writeText(url)
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Room name"
              className="flex-[1_1_200px] min-w-[140px] px-3 py-2 border border-border-glass rounded-md text-[13px] bg-surface text-text-primary outline-none placeholder:text-text-muted/30"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
            <select
              value={newSystemId}
              onChange={(e) => setNewSystemId(e.target.value)}
              className="px-3 py-2 border border-border-glass rounded-md text-[13px] bg-surface text-text-primary outline-none cursor-pointer"
            >
              {AVAILABLE_SYSTEMS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreate}
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

          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center gap-3 px-5 py-3 border-b border-border-glass/30"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">{room.name}</div>
                <div className="text-[11px] text-text-muted/35 mt-0.5">
                  {room.id} &middot; {formatDate(room.createdAt)}
                </div>
              </div>

              <a
                href={`#room=${room.id}`}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-success/15 text-success border border-success/20 no-underline transition-colors duration-fast hover:bg-success/25"
              >
                Enter
              </a>

              <button
                onClick={() => copyLink(room.id)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-info/15 text-info border border-info/20 transition-colors duration-fast hover:bg-info/25"
              >
                <Link size={11} strokeWidth={2} />
                Copy Link
              </button>

              <button
                onClick={() => handleDelete(room.id)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer bg-danger/10 text-danger border border-danger/15 transition-colors duration-fast hover:bg-danger/20"
              >
                <Trash2 size={11} strokeWidth={2} />
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
