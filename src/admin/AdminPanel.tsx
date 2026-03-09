import { useState, useEffect, useCallback } from 'react'

interface RoomMeta {
  id: string
  name: string
  createdAt: number
}

export function AdminPanel() {
  const [rooms, setRooms] = useState<RoomMeta[]>([])
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const apiBase = import.meta.env.DEV ? 'http://localhost:4444' : ''

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/rooms`)
      setRooms(await res.json())
    } catch {
      setError('Failed to fetch rooms')
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  const handleCreate = async () => {
    setError('')
    const id = newId.trim()
    const name = newName.trim() || id
    if (!id) { setError('Room ID is required'); return }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { setError('ID must be URL-safe (a-z, 0-9, -, _)'); return }
    try {
      const res = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Create failed')
        return
      }
      setNewId('')
      setNewName('')
      fetchRooms()
    } catch {
      setError('Network error')
    }
  }

  const handleDelete = async (roomId: string) => {
    if (!confirm(`Delete room "${roomId}"? This will permanently erase all data.`)) return
    try {
      await fetch(`${apiBase}/api/rooms/${roomId}`, { method: 'DELETE' })
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

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 6,
    fontSize: 13,
    background: 'rgba(255,255,255,0.06)',
    color: '#e4e4e7',
    outline: 'none',
  }

  const btnStyle: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f19',
      color: '#e4e4e7',
      fontFamily: 'system-ui, sans-serif',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 300 }}>Room Management</h1>
          <a href="#" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Back to Landing</a>
        </div>

        {/* Create room form */}
        <div style={{
          background: 'rgba(30,35,48,0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
            Create Room
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Room ID (url-safe)"
              style={{ ...inputStyle, flex: '1 1 140px', minWidth: 120 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name (optional)"
              style={{ ...inputStyle, flex: '1 1 180px', minWidth: 120 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
            <button
              onClick={handleCreate}
              style={{ ...btnStyle, background: '#3b82f6', color: '#fff' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#3b82f6' }}
            >
              Create
            </button>
          </div>
          {error && (
            <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{error}</div>
          )}
        </div>

        {/* Room list */}
        <div style={{
          background: 'rgba(30,35,48,0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Rooms ({rooms.length})
            </span>
          </div>

          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Loading...</div>
          )}

          {!loading && rooms.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              No rooms yet. Create one above.
            </div>
          )}

          {rooms.map((room) => (
            <div
              key={room.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{room.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {room.id} &middot; {formatDate(room.createdAt)}
                </div>
              </div>

              <a
                href={`#room=${room.id}`}
                style={{
                  ...btnStyle,
                  background: 'rgba(34,197,94,0.15)',
                  color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.2)',
                  fontSize: 12,
                  padding: '6px 14px',
                  textDecoration: 'none',
                }}
              >
                Enter
              </a>

              <button
                onClick={() => copyLink(room.id)}
                style={{
                  ...btnStyle,
                  background: 'rgba(59,130,246,0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.2)',
                  fontSize: 12,
                  padding: '6px 14px',
                }}
              >
                Copy Link
              </button>

              <button
                onClick={() => handleDelete(room.id)}
                style={{
                  ...btnStyle,
                  background: 'rgba(239,68,68,0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: 12,
                  padding: '6px 14px',
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
