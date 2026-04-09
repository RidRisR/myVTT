// src/debug/DebugLogPanel.tsx — DEV-only debug panel for game_log inspection
import { useState, useEffect, useRef, useMemo } from 'react'
import { useWorldStore } from '../stores/worldStore'
import type { GameLogEntry } from '../shared/logTypes'

const TYPE_COLORS: Record<string, string> = {
  'core:text': '#60a5fa',
  'core:roll-result': '#f59e0b',
  'core:component-update': '#a78bfa',
}

function EntryRow({ entry, isNew }: { entry: GameLogEntry; isNew: boolean }) {
  const color = TYPE_COLORS[entry.type] ?? '#94a3b8'
  const originName = entry.origin.entity?.name ?? entry.origin.seat.name
  const time = new Date(entry.timestamp).toLocaleTimeString()

  return (
    <div
      style={{
        padding: '6px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.5,
        background: isNew ? 'rgba(96,165,250,0.08)' : 'transparent',
        transition: 'background 1s',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: '#666', minWidth: 36 }}>#{entry.seq}</span>
        <span
          style={{
            color,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 4,
            background: `${color}18`,
          }}
        >
          {entry.type}
        </span>
        <span style={{ color: '#888' }}>{originName}</span>
        <span style={{ color: '#555', marginLeft: 'auto', fontSize: 11 }}>{time}</span>
      </div>
      {entry.parentId && (
        <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
          parent: {entry.parentId.slice(0, 8)}… chain:{entry.chainDepth}
        </div>
      )}
      <pre
        style={{
          color: '#ccc',
          margin: '4px 0 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontSize: 11,
          maxHeight: 120,
          overflow: 'auto',
        }}
      >
        {JSON.stringify(entry.payload, null, 2)}
      </pre>
    </div>
  )
}

export function DebugLogPanel({ roomId }: { roomId: string }) {
  const logEntries = useWorldStore((s) => s.logEntries)
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)
  const [newSeqs, setNewSeqs] = useState<Set<number>>(new Set())

  // Track new entries for highlight
  useEffect(() => {
    if (logEntries.length > prevCountRef.current) {
      const fresh = logEntries.slice(prevCountRef.current).map((e) => e.seq)
      setNewSeqs(new Set(fresh))
      // Clear highlight after 2s
      const timer = setTimeout(() => {
        setNewSeqs(new Set())
      }, 2000)
      prevCountRef.current = logEntries.length
      return () => {
        clearTimeout(timer)
      }
    }
    prevCountRef.current = logEntries.length
  }, [logEntries])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logEntries, autoScroll])

  const filtered = useMemo(() => {
    if (!filter) return logEntries
    const lower = filter.toLowerCase()
    return logEntries.filter(
      (e) =>
        e.type.toLowerCase().includes(lower) ||
        JSON.stringify(e.payload).toLowerCase().includes(lower),
    )
  }, [logEntries, filter])

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f0f19',
        color: '#e4e4e7',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Game Log Debug</h2>
        <span style={{ color: '#666', fontSize: 12 }}>
          Room: {roomId} | {logEntries.length} entries
        </span>
        <input
          type="text"
          placeholder="Filter by type or payload…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
          }}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e4e4e7',
            fontSize: 12,
            width: 240,
            outline: 'none',
          }}
        />
        <label
          style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => {
              setAutoScroll(e.target.checked)
            }}
          />
          Auto-scroll
        </label>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#555' }}>
            {logEntries.length === 0
              ? 'No log entries yet. Join a room and perform actions to see entries.'
              : 'No entries match filter.'}
          </div>
        ) : (
          filtered.map((entry) => (
            <EntryRow key={entry.id} entry={entry} isNew={newSeqs.has(entry.seq)} />
          ))
        )}
      </div>
    </div>
  )
}
