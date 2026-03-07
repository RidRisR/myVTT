import { useRef, useState, useCallback, useEffect } from 'react'
import { useValue } from 'tldraw'
import type { Seat } from '../identity/useIdentity'
import { currentRole } from '../roleState'

interface PlayerPanelProps {
  seats: Seat[]
  mySeat: Seat
  mySeatId: string
  onlineSeatIds: Set<string>
  onLeave: () => void
  onUpdateProperties: (seatId: string, properties: { key: string; value: string }[]) => void
}

export function PlayerPanel({
  seats, mySeat, mySeatId, onlineSeatIds, onLeave, onUpdateProperties,
}: PlayerPanelProps) {
  const [pos, setPos] = useState({ x: 12, y: 12 })
  const [isOpen, setIsOpen] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(mySeatId)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const holdRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; interval: ReturnType<typeof setInterval> | null }>({ timer: null, interval: null })

  const viewRole = useValue('currentRole', () => currentRole.get(), [])

  const holdStop = useCallback(() => {
    if (holdRef.current.timer) clearTimeout(holdRef.current.timer)
    if (holdRef.current.interval) clearInterval(holdRef.current.interval)
    holdRef.current = { timer: null, interval: null }
  }, [])

  useEffect(() => holdStop, [holdStop])

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input')) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setPos({
      x: dragRef.current.origX + e.clientX - dragRef.current.startX,
      y: dragRef.current.origY + e.clientY - dragRef.current.startY,
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const adjustValue = (seatId: string, index: number, delta: number) => {
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return
    const props = seat.properties ?? []
    if (index >= props.length) return
    const val = props[index].value
    const hpMatch = val.match(/^(\d+)\/(\d+)$/)
    let newVal: string
    if (hpMatch) {
      const cur = parseInt(hpMatch[1])
      const max = parseInt(hpMatch[2])
      newVal = `${Math.max(0, Math.min(cur + delta, max))}/${max}`
    } else {
      newVal = `${Math.max(0, parseInt(val) + delta)}`
    }
    const updated = [...props]
    updated[index] = { ...updated[index], value: newVal }
    onUpdateProperties(seatId, updated)
  }

  const holdStart = (seatId: string, index: number, delta: number) => {
    holdStop()
    adjustValue(seatId, index, delta)
    let count = 0
    holdRef.current.timer = setTimeout(() => {
      holdRef.current.interval = setInterval(() => {
        count++
        adjustValue(seatId, index, count > 15 ? delta * 5 : delta)
      }, 80)
    }, 400)
  }

  const handleAddProperty = (seatId: string) => {
    if (!newKey.trim()) return
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return
    const props = seat.properties ?? []
    onUpdateProperties(seatId, [...props, { key: newKey.trim(), value: newValue.trim() }])
    setNewKey('')
    setNewValue('')
  }

  const handleDeleteProperty = (seatId: string, index: number) => {
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return
    onUpdateProperties(seatId, (seat.properties ?? []).filter((_, i) => i !== index))
    if (editingIndex === index) setEditingIndex(null)
  }

  const startEdit = (index: number, key: string, value: string) => {
    setEditingIndex(index)
    setEditKey(key)
    setEditValue(value)
  }

  const commitEdit = (seatId: string) => {
    if (editingIndex === null) return
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return
    const props = [...(seat.properties ?? [])]
    props[editingIndex] = { key: editKey.trim() || props[editingIndex].key, value: editValue }
    onUpdateProperties(seatId, props)
    setEditingIndex(null)
  }

  // Sort: my seat first, then by name
  const sortedSeats = [...seats].sort((a, b) => {
    if (a.id === mySeatId) return -1
    if (b.id === mySeatId) return 1
    return a.name.localeCompare(b.name)
  })

  // Collapsed button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', left: pos.x, top: pos.y,
          zIndex: 99999, padding: '8px 16px',
          background: '#2563eb', color: '#fff', border: 'none',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'sans-serif',
          fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        Players
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed', left: pos.x, top: pos.y,
        zIndex: 99999, width: 260,
        background: '#fff', borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        fontFamily: 'sans-serif', fontSize: 13,
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 16px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: dragRef.current ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Players</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {mySeat.role === 'GM' && (
            <button
              onClick={() => currentRole.set(viewRole === 'GM' ? 'PL' : 'GM')}
              title={viewRole === 'GM' ? 'Switch to PL view' : 'Switch to GM view'}
              style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                border: '1px solid #d1d5db', cursor: 'pointer',
                background: viewRole === 'PL' ? '#fee2e2' : '#f3f4f6',
                color: viewRole === 'PL' ? '#dc2626' : '#666',
                fontWeight: 600,
              }}
            >
              {viewRole === 'PL' ? 'PL' : 'GM'}
            </button>
          )}
          <button
            onClick={onLeave}
            title="Leave seat"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0 2px', display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: '#666', padding: '0 4px',
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* Seat list */}
      <div style={{ padding: '8px 0', maxHeight: 400, overflowY: 'auto' }}>
        {sortedSeats.map((seat) => {
          const isMe = seat.id === mySeatId
          const isOnline = isMe || onlineSeatIds.has(seat.id)
          const isExpanded = expandedId === seat.id
          const properties = seat.properties ?? []

          return (
            <div key={seat.id}>
              {/* Seat row */}
              <div
                onClick={() => {
                  setExpandedId(isExpanded ? null : seat.id)
                  setEditingIndex(null)
                  setNewKey('')
                  setNewValue('')
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', cursor: 'pointer',
                  background: isExpanded ? '#f9fafb' : 'transparent',
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isOnline ? seat.color : '#d1d5db',
                }} />
                <span style={{
                  flex: 1, fontWeight: isMe ? 700 : 400,
                  color: isOnline ? '#333' : '#999',
                }}>
                  {seat.name}{isMe ? ' (me)' : ''}
                </span>
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 3,
                  background: seat.role === 'GM' ? '#fef3c7' : '#dbeafe',
                  color: seat.role === 'GM' ? '#92400e' : '#1e40af',
                }}>
                  {seat.role}
                </span>
                <span style={{ fontSize: 10, color: '#999' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>

              {/* Expanded: properties */}
              {isExpanded && (
                <div style={{ padding: '4px 16px 8px 32px' }}>
                  {properties.length === 0 && !isMe && (
                    <div style={{ color: '#ccc', fontSize: 12, padding: '4px 0' }}>
                      No properties
                    </div>
                  )}

                  {properties.map((prop, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 0', borderBottom: '1px solid #f3f4f6',
                    }}>
                      {isMe && editingIndex === i ? (
                        <div
                          style={{ display: 'flex', gap: 4, flex: 1 }}
                          onBlur={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return
                            commitEdit(seat.id)
                          }}
                        >
                          <input
                            autoFocus
                            value={editKey}
                            onChange={(e) => setEditKey(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(seat.id); if (e.key === 'Escape') setEditingIndex(null) }}
                            style={{
                              width: 60, padding: '2px 6px', border: '1px solid #2563eb',
                              borderRadius: 4, fontSize: 12,
                            }}
                          />
                          <input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(seat.id); if (e.key === 'Escape') setEditingIndex(null) }}
                            style={{
                              flex: 1, padding: '2px 6px', border: '1px solid #2563eb',
                              borderRadius: 4, fontSize: 12,
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <span
                            onClick={() => isMe && startEdit(i, prop.key, prop.value)}
                            style={{
                              fontWeight: 600, color: '#333', minWidth: 40,
                              cursor: isMe ? 'pointer' : 'default', fontSize: 12,
                            }}
                          >
                            {prop.key}
                          </span>
                          <span style={{ flex: 1 }} />
                          <span style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            gap: 2, minWidth: 90,
                          }}>
                            {isMe && /^\d+(\/\d+)?$/.test(prop.value) && (
                              <>
                                <button
                                  onPointerDown={() => holdStart(seat.id, i, -1)}
                                  onPointerUp={holdStop}
                                  onPointerLeave={holdStop}
                                  style={{
                                    background: 'none', border: '1px solid #ddd', borderRadius: 3,
                                    cursor: 'pointer', width: 16, height: 16, padding: 0,
                                    fontSize: 11, lineHeight: 1, color: '#666', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >−</button>
                                <button
                                  onPointerDown={() => holdStart(seat.id, i, 1)}
                                  onPointerUp={holdStop}
                                  onPointerLeave={holdStop}
                                  style={{
                                    background: 'none', border: '1px solid #ddd', borderRadius: 3,
                                    cursor: 'pointer', width: 16, height: 16, padding: 0,
                                    fontSize: 11, lineHeight: 1, color: '#666', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >+</button>
                              </>
                            )}
                            <span
                              onClick={() => isMe && startEdit(i, prop.key, prop.value)}
                              style={{
                                color: '#666', fontSize: 12,
                                cursor: isMe ? 'pointer' : 'default',
                                borderBottom: isMe ? '1px dashed #ccc' : 'none',
                                padding: '0 2px', minWidth: 50, textAlign: 'right',
                              }}
                            >
                              {prop.value || '(empty)'}
                            </span>
                          </span>
                        </>
                      )}
                      {isMe && editingIndex !== i && (
                        <button
                          onClick={() => handleDeleteProperty(seat.id, i)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#ccc', fontSize: 13, padding: '0 2px', lineHeight: 1,
                          }}
                          title="Delete"
                        >
                          x
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add property (own seat only) */}
                  {isMe && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <input
                        placeholder="Key"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddProperty(seat.id)}
                        style={{
                          width: 60, padding: '3px 6px', border: '1px solid #ddd',
                          borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
                        }}
                      />
                      <input
                        placeholder="Value"
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddProperty(seat.id)}
                        style={{
                          flex: 1, padding: '3px 6px', border: '1px solid #ddd',
                          borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
                        }}
                      />
                      <button
                        onClick={() => handleAddProperty(seat.id)}
                        disabled={!newKey.trim()}
                        style={{
                          padding: '3px 8px', background: newKey.trim() ? '#2563eb' : '#e5e7eb',
                          color: '#fff', border: 'none', borderRadius: 4,
                          cursor: newKey.trim() ? 'pointer' : 'default', fontSize: 11,
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}


                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
