import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { Editor } from 'tldraw'
import { rollDice, resolveFormula, type DiceLogEntry } from './diceUtils'
import type { DiceFavorite } from './identity/useIdentity'

interface DiceSidebarProps {
  yDoc: Y.Doc
  playerName: string
  editor: Editor | null
  seatProperties: { key: string; value: string }[]
  favorites: DiceFavorite[]
  onUpdateFavorites: (favorites: DiceFavorite[]) => void
}

interface Suggestion {
  key: string
  value: string
  from: 'token' | 'seat'
}

export function DiceSidebar({ yDoc, playerName, editor, seatProperties, favorites, onUpdateFavorites }: DiceSidebarProps) {
  const [input, setInput] = useState('1d20')
  const [logs, setLogs] = useState<DiceLogEntry[]>([])
  const [isOpen, setIsOpen] = useState(true)
  const [error, setError] = useState('')
  const [addingFav, setAddingFav] = useState(false)
  const [favName, setFavName] = useState('')
  const [favFormula, setFavFormula] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const doRoll = (formula: string) => {
    const trimmed = formula.trim()

    // Resolve @key references
    const tokenShapes = editor?.getSelectedShapes() ?? []
    const tokenShape = tokenShapes.length === 1 ? tokenShapes[0] : null
    const tokenProps = (tokenShape?.meta?.properties as { key: string; value: string }[]) ?? []

    let expression = trimmed
    let resolvedExpression = trimmed

    if (/@[\p{L}\p{N}_]+/u.test(trimmed)) {
      const resolved = resolveFormula(trimmed, tokenProps, seatProperties)
      if ('error' in resolved) {
        setError(resolved.error)
        return
      }
      expression = trimmed
      resolvedExpression = resolved.resolved
    }

    const result = rollDice(resolvedExpression)
    if (!result) {
      setError('Invalid format. Use NdM+X or NdM+@KEY, e.g. 1d20+@STR')
      return
    }
    setError('')

    const entry: DiceLogEntry = {
      id: crypto.randomUUID(),
      roller: playerName,
      expression,
      resolvedExpression: expression !== resolvedExpression ? resolvedExpression : undefined,
      rolls: result.rolls,
      modifier: result.modifier,
      total: result.total,
      timestamp: Date.now(),
    }

    yLogs.push([entry])
  }

  const handleRoll = () => { doRoll(input); setShowSuggestions(false) }

  // Build available suggestions from token + seat props
  const getTokenProps = (): { key: string; value: string }[] => {
    const shapes = editor?.getSelectedShapes() ?? []
    const shape = shapes.length === 1 ? shapes[0] : null
    return (shape?.meta?.properties as { key: string; value: string }[]) ?? []
  }

  const suggestions = useMemo((): Suggestion[] => {
    const tokenProps = getTokenProps()
    const items: Suggestion[] = []
    const seen = new Set<string>()
    for (const p of tokenProps) {
      if (!seen.has(p.key)) { items.push({ key: p.key, value: p.value, from: 'token' }); seen.add(p.key) }
    }
    for (const p of seatProperties) {
      if (!seen.has(p.key)) { items.push({ key: p.key, value: p.value, from: 'seat' }); seen.add(p.key) }
    }
    return items
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatProperties, editor?.getSelectedShapes()])

  // Extract the @prefix being typed at cursor position
  const getAtPrefix = (): string | null => {
    const el = inputRef.current
    if (!el) return null
    const pos = el.selectionStart ?? input.length
    const before = input.slice(0, pos)
    const match = before.match(/@([\p{L}\p{N}_]*)$/u)
    return match ? match[1] : null
  }

  const atPrefix = showSuggestions ? getAtPrefix() : null
  const filtered = atPrefix !== null
    ? suggestions.filter((s) => s.key.toLowerCase().startsWith(atPrefix.toLowerCase()))
    : []

  const applySuggestion = (key: string) => {
    const el = inputRef.current
    if (!el) return
    const pos = el.selectionStart ?? input.length
    const before = input.slice(0, pos)
    const after = input.slice(pos)
    const atPos = before.lastIndexOf('@')
    if (atPos === -1) return
    const newInput = before.slice(0, atPos) + '@' + key + after
    setInput(newInput)
    setShowSuggestions(false)
    // Restore cursor after the inserted key
    requestAnimationFrame(() => {
      const newPos = atPos + 1 + key.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    })
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
        <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Show suggestions when @ is being typed
              const pos = e.target.selectionStart ?? e.target.value.length
              const before = e.target.value.slice(0, pos)
              if (/@[\p{L}\p{N}_]*$/u.test(before)) {
                setShowSuggestions(true)
                setSuggestionIndex(0)
              } else {
                setShowSuggestions(false)
              }
            }}
            onKeyDown={(e) => {
              if (showSuggestions && filtered.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSuggestionIndex((i) => Math.min(i + 1, filtered.length - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSuggestionIndex((i) => Math.max(i - 1, 0))
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  applySuggestion(filtered[suggestionIndex].key)
                  return
                }
                if (e.key === 'Escape') {
                  setShowSuggestions(false)
                  return
                }
              }
              if (e.key === 'Enter') handleRoll()
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="1d20+@STR"
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          {/* Autocomplete dropdown */}
          {showSuggestions && filtered.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 64,
              marginTop: 2, background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 10, maxHeight: 150, overflowY: 'auto',
            }}>
              {filtered.map((s, i) => (
                <div
                  key={s.key}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s.key) }}
                  style={{
                    padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: i === suggestionIndex ? '#eff6ff' : 'transparent',
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 600, color: '#333' }}>@{s.key}</span>
                    <span style={{ color: '#999', marginLeft: 6 }}>{s.value}</span>
                  </span>
                  <span style={{
                    fontSize: 9, padding: '1px 4px', borderRadius: 3,
                    background: s.from === 'token' ? '#fef3c7' : '#dbeafe',
                    color: s.from === 'token' ? '#92400e' : '#1e40af',
                  }}>
                    {s.from}
                  </span>
                </div>
              ))}
            </div>
          )}
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
              onClick={() => { setInput(d); doRoll(d) }}
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

      {/* Favorites */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: '#666' }}>Favorites</span>
          <button
            onClick={() => setAddingFav(!addingFav)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, color: '#2563eb', padding: '0 4px', lineHeight: 1,
            }}
          >
            {addingFav ? 'x' : '+'}
          </button>
        </div>
        {addingFav && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <input
              placeholder="Name"
              value={favName}
              onChange={(e) => setFavName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && favName.trim() && favFormula.trim()) {
                  onUpdateFavorites([...favorites, { name: favName.trim(), formula: favFormula.trim() }])
                  setFavName('')
                  setFavFormula('')
                  setAddingFav(false)
                }
                if (e.key === 'Escape') setAddingFav(false)
              }}
              style={{
                width: 60, padding: '3px 6px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
              }}
            />
            <input
              placeholder="1d20+@STR"
              value={favFormula}
              onChange={(e) => setFavFormula(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && favName.trim() && favFormula.trim()) {
                  onUpdateFavorites([...favorites, { name: favName.trim(), formula: favFormula.trim() }])
                  setFavName('')
                  setFavFormula('')
                  setAddingFav(false)
                }
                if (e.key === 'Escape') setAddingFav(false)
              }}
              style={{
                flex: 1, padding: '3px 6px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {favorites.map((fav, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: '3px 8px', background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}
            >
              <span onClick={() => doRoll(fav.formula)} title={fav.formula}>
                {fav.name}
              </span>
              <button
                onClick={() => onUpdateFavorites(favorites.filter((_, j) => j !== i))}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#93c5fd', fontSize: 11, padding: '0 1px', lineHeight: 1,
                }}
                title="Remove"
              >
                x
              </button>
            </span>
          ))}
          {favorites.length === 0 && !addingFav && (
            <span style={{ color: '#ccc', fontSize: 11 }}>No favorites yet</span>
          )}
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
              <span style={{ fontWeight: 600, color: '#2563eb' }}>
                {entry.roller}
              </span>
              <span style={{ color: '#999', fontSize: 11 }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <span style={{ color: '#333' }}>{entry.expression}</span>
              {entry.resolvedExpression && (
                <span style={{ color: '#999', fontSize: 11 }}> ({entry.resolvedExpression})</span>
              )}
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
