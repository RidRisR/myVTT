import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { rollDice, type DiceLogEntry } from './diceUtils'
import { currentRole } from './roleState'
import { useValue } from 'tldraw'

export function DiceSidebar({ yDoc }: { yDoc: Y.Doc }) {
  const [input, setInput] = useState('1d20')
  const [logs, setLogs] = useState<DiceLogEntry[]>([])
  const [isOpen, setIsOpen] = useState(true)
  const [error, setError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const role = useValue(currentRole)

  const yLogs = yDoc.getArray<DiceLogEntry>('dice_log')

  useEffect(() => {
    // Load existing entries
    setLogs(yLogs.toArray())

    const observer = () => {
      setLogs(yLogs.toArray())
    }
    yLogs.observe(observer)
    return () => yLogs.unobserve(observer)
  }, [yLogs])

  const handleRoll = () => {
    const result = rollDice(input.trim())
    if (!result) {
      setError('Invalid format. Use NdM+X, e.g. 2d6+5')
      return
    }
    setError('')

    const entry: DiceLogEntry = {
      id: crypto.randomUUID(),
      roller: role,
      expression: result.expression,
      rolls: result.rolls,
      modifier: result.modifier,
      total: result.total,
      timestamp: Date.now(),
    }

    yLogs.push([entry])
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          zIndex: 99999,
          padding: '8px 16px',
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontFamily: 'sans-serif',
          fontSize: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        Dice
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: '#fff',
        borderLeft: '1px solid #e5e7eb',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>Dice Roller</span>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            color: '#666',
            padding: '0 4px',
          }}
        >
          x
        </button>
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRoll()}
            placeholder="2d6+5"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleRoll}
            style={{
              padding: '6px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Roll
          </button>
        </div>
        {error && (
          <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{error}</div>
        )}
        {/* Quick buttons */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((d) => (
            <button
              key={d}
              onClick={() => {
                setInput(d)
                const result = rollDice(d)
                if (!result) return
                yLogs.push([{
                  id: crypto.randomUUID(),
                  roller: role,
                  expression: d,
                  rolls: result.rolls,
                  modifier: 0,
                  total: result.total,
                  timestamp: Date.now(),
                }])
              }}
              style={{
                padding: '4px 8px',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Log */}
      <div
        ref={logRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px',
        }}
      >
        {[...logs].reverse().map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontWeight: 600, color: entry.roller === 'GM' ? '#d97706' : '#2563eb' }}>
                {entry.roller}
              </span>
              <span style={{ color: '#999', fontSize: 11 }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <span style={{ color: '#333' }}>{entry.expression}</span>
              <span style={{ color: '#999', margin: '0 4px' }}>=</span>
              <span style={{ color: '#666' }}>
                [{entry.rolls.join(', ')}]
                {entry.modifier !== 0 && (
                  <span>{entry.modifier > 0 ? '+' : ''}{entry.modifier}</span>
                )}
              </span>
              <span style={{ color: '#999', margin: '0 4px' }}>=</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>
                {entry.total}
              </span>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>
            No rolls yet
          </div>
        )}
      </div>
    </div>
  )
}
