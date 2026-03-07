import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { useValue, type Editor } from 'tldraw'
import { rollCompound, resolveFormula, generateFavoriteName, type DiceLogEntry } from './diceUtils'
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
  const [quickCount, setQuickCount] = useState(1)
  const [addingFav, setAddingFav] = useState(false)
  const [favName, setFavName] = useState('')
  const [favFormula, setFavFormula] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [hoveredLogId, setHoveredLogId] = useState<string | null>(null)
  const [editingFavIndex, setEditingFavIndex] = useState<number | null>(null)
  const [editFavName, setEditFavName] = useState('')
  const [editFavFormula, setEditFavFormula] = useState('')
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
        const hint = !tokenShape ? ' (try selecting a token)' : ''
        setError(resolved.error + hint)
        return
      }
      expression = trimmed
      resolvedExpression = resolved.resolved
    }

    const result = rollCompound(resolvedExpression)
    if (!result) {
      setError('Invalid format. Examples: 1d20+5, 4d6kh3, 2d6+@STR')
      return
    }
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError('')

    const entry: DiceLogEntry = {
      id: crypto.randomUUID(),
      roller: playerName,
      expression,
      resolvedExpression: expression !== resolvedExpression ? resolvedExpression : undefined,
      // Legacy compat fields
      rolls: result.termResults
        .filter((tr) => tr.term.type === 'dice')
        .flatMap((tr) => tr.keptIndices.map((i) => tr.allRolls[i])),
      modifier: result.termResults
        .filter((tr) => tr.term.type === 'constant')
        .reduce((sum, tr) => sum + tr.subtotal, 0),
      // New compound data
      terms: result.termResults,
      total: result.total,
      timestamp: Date.now(),
    }

    yLogs.push([entry])
  }

  const handleRoll = () => { doRoll(input); setShowSuggestions(false) }

  // Reactively track selected token properties via tldraw's useValue
  const selectedTokenProps = useValue('selectedTokenProps', () => {
    const shapes = editor?.getSelectedShapes() ?? []
    const shape = shapes.length === 1 ? shapes[0] : null
    return (shape?.meta?.properties as { key: string; value: string }[]) ?? []
  }, [editor])

  // Build available suggestions from token + seat props
  const suggestions = useMemo((): Suggestion[] => {
    const items: Suggestion[] = []
    const seen = new Set<string>()
    for (const p of selectedTokenProps) {
      if (!seen.has(p.key)) { items.push({ key: p.key, value: p.value, from: 'token' }); seen.add(p.key) }
    }
    for (const p of seatProperties) {
      if (!seen.has(p.key)) { items.push({ key: p.key, value: p.value, from: 'seat' }); seen.add(p.key) }
    }
    return items
  }, [selectedTokenProps, seatProperties])

  // Available keys for reactive favorite availability
  const availableKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const s of suggestions) keys.add(s.key)
    return keys
  }, [suggestions])

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
  const filteredKeys = atPrefix !== null
    ? suggestions.filter((s) => s.key.toLowerCase().startsWith(atPrefix.toLowerCase()))
    : []

  // Available favorites for autocomplete (only those that can resolve in current context)
  const filteredFavs = atPrefix !== null
    ? favorites.filter((fav) => {
        const keys = [...fav.formula.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((m) => m[1])
        const isAvailable = keys.length === 0 || keys.every((k) => availableKeys.has(k))
        if (!isAvailable) return false
        const q = atPrefix.toLowerCase()
        return fav.name.toLowerCase().includes(q) || fav.formula.toLowerCase().includes(q)
      })
    : []

  const dropdownTotal = filteredKeys.length + filteredFavs.length

  const applyKeySuggestion = (key: string) => {
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
    requestAnimationFrame(() => {
      const newPos = atPos + 1 + key.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    })
  }

  const applyFavSuggestion = (formula: string) => {
    const el = inputRef.current
    if (!el) return
    const pos = el.selectionStart ?? input.length
    const before = input.slice(0, pos)
    const after = input.slice(pos)
    const atPos = before.lastIndexOf('@')
    if (atPos === -1) return
    const newInput = before.slice(0, atPos) + formula + after
    setInput(newInput)
    setShowSuggestions(false)
    requestAnimationFrame(() => {
      const newPos = atPos + formula.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    })
  }

  const applyDropdownItem = (index: number) => {
    if (index < filteredKeys.length) {
      applyKeySuggestion(filteredKeys[index].key)
    } else {
      applyFavSuggestion(filteredFavs[index - filteredKeys.length].formula)
    }
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
              if (showSuggestions && dropdownTotal > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSuggestionIndex((i) => Math.min(i + 1, dropdownTotal - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSuggestionIndex((i) => Math.max(i - 1, 0))
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  applyDropdownItem(suggestionIndex)
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
          {showSuggestions && dropdownTotal > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 64,
              marginTop: 2, background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 10, maxHeight: 200, overflowY: 'auto',
            }}>
              {filteredKeys.map((s, i) => (
                <div
                  key={`key-${s.key}`}
                  onMouseDown={(e) => { e.preventDefault(); applyKeySuggestion(s.key) }}
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
              {filteredKeys.length > 0 && filteredFavs.length > 0 && (
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '3px 10px', fontSize: 10, color: '#999' }}>
                  Favorites
                </div>
              )}
              {filteredFavs.map((fav, i) => {
                const idx = filteredKeys.length + i
                return (
                  <div
                    key={`fav-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); applyFavSuggestion(fav.formula) }}
                    style={{
                      padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: idx === suggestionIndex ? '#eff6ff' : 'transparent',
                    }}
                  >
                    <span>
                      <span style={{ fontWeight: 600, color: '#333' }}>{fav.name}</span>
                      <span style={{ color: '#999', marginLeft: 6 }}>{fav.formula}</span>
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>
                )
              })}
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
        {/* Quick roll */}
        <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
          <select
            value={quickCount}
            onChange={(e) => setQuickCount(Number(e.target.value))}
            style={{
              padding: '4px 2px', border: '1px solid #e5e7eb', borderRadius: 4,
              fontSize: 12, background: '#f9fafb', color: '#333', cursor: 'pointer',
              width: 36,
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span style={{ color: '#999', fontSize: 12 }}>x</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            {[[4, 6, 8, 10], [12, 20, 100]].map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 3 }}>
                {row.map((sides) => {
                  const expr = quickCount === 1 ? `d${sides}` : `${quickCount}d${sides}`
                  return (
                    <button
                      key={sides}
                      onClick={() => { setInput(expr); doRoll(expr) }}
                      style={{
                        padding: '4px 0', flex: 1,
                        background: '#f3f4f6', border: '1px solid #e5e7eb',
                        borderRadius: 4, cursor: 'pointer',
                        fontSize: 11, textAlign: 'center',
                      }}
                    >
                      d{sides}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
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
          <div
            style={{
              padding: '6px 8px', background: '#eff6ff', border: '1px solid #2563eb',
              borderRadius: 4, marginBottom: 6,
            }}
            onBlur={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              if (favName.trim() && favFormula.trim()) {
                onUpdateFavorites([...favorites, { name: favName.trim(), formula: favFormula.trim() }])
                setFavName('')
                setFavFormula('')
              }
              setAddingFav(false)
            }}
          >
            <input
              autoFocus
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
                width: '100%', padding: '2px 6px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 11, boxSizing: 'border-box', marginBottom: 3,
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
                width: '100%', padding: '2px 6px', border: '1px solid #ddd',
                borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
              }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {favorites.map((fav, i) => {
            const keys = [...fav.formula.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((m) => m[1])
            const seatKeys = new Set(seatProperties.map((p) => p.key))
            const needsToken = keys.some((k) => !seatKeys.has(k))
            const isDisabled = keys.length > 0 && keys.some((k) => !availableKeys.has(k))
            const isEditing = editingFavIndex === i

            if (isEditing) {
              const editKeys = [...editFavFormula.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((m) => m[1])
              return (
                <div
                  key={i}
                  style={{
                    padding: '6px 8px', background: '#eff6ff', border: '1px solid #2563eb',
                    borderRadius: 4,
                  }}
                  onBlur={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return
                    if (editFavName.trim() && editFavFormula.trim()) {
                      const updated = [...favorites]
                      updated[i] = { name: editFavName.trim(), formula: editFavFormula.trim() }
                      onUpdateFavorites(updated)
                    }
                    setEditingFavIndex(null)
                  }}
                >
                  <input
                    autoFocus
                    value={editFavName}
                    onChange={(e) => setEditFavName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editFavName.trim() && editFavFormula.trim()) {
                        const updated = [...favorites]
                        updated[i] = { name: editFavName.trim(), formula: editFavFormula.trim() }
                        onUpdateFavorites(updated)
                        setEditingFavIndex(null)
                      }
                      if (e.key === 'Escape') setEditingFavIndex(null)
                    }}
                    placeholder="Name"
                    style={{
                      width: '100%', padding: '2px 6px', border: '1px solid #ddd',
                      borderRadius: 4, fontSize: 11, boxSizing: 'border-box', marginBottom: 3,
                    }}
                  />
                  <input
                    value={editFavFormula}
                    onChange={(e) => setEditFavFormula(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editFavName.trim() && editFavFormula.trim()) {
                        const updated = [...favorites]
                        updated[i] = { name: editFavName.trim(), formula: editFavFormula.trim() }
                        onUpdateFavorites(updated)
                        setEditingFavIndex(null)
                      }
                      if (e.key === 'Escape') setEditingFavIndex(null)
                    }}
                    placeholder="1d20+@STR"
                    style={{
                      width: '100%', padding: '2px 6px', border: '1px solid #ddd',
                      borderRadius: 4, fontSize: 11, boxSizing: 'border-box',
                    }}
                  />
                  {editKeys.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {editKeys.map((k) => (
                        <span key={k} style={{
                          fontSize: 9, padding: '1px 4px', borderRadius: 3,
                          background: seatKeys.has(k) ? '#dbeafe' : '#fef3c7',
                          color: seatKeys.has(k) ? '#1e40af' : '#92400e',
                        }}>
                          @{k} {seatKeys.has(k) ? 'seat' : 'token'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div
                key={i}
                onClick={() => !isDisabled && doRoll(fav.formula)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 8px', background: '#eff6ff', border: '1px solid #bfdbfe',
                  borderRadius: 4,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isDisabled ? 0.4 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 11, color: '#333' }}>{fav.name}</div>
                  <div style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fav.formula}
                  </div>
                </div>
                {needsToken && (
                  <span
                    title="Requires a selected token"
                    style={{
                      fontSize: 9, padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                      background: '#fef3c7', color: '#92400e',
                    }}
                  >
                    token
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingFavIndex(i)
                    setEditFavName(fav.name)
                    setEditFavFormula(fav.formula)
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#93c5fd', padding: 0, flexShrink: 0,
                    width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Edit"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateFavorites(favorites.filter((_, j) => j !== i)) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#93c5fd', padding: 0, flexShrink: 0,
                    width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
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
        {[...logs].reverse().map((entry) => {
          const isFaved = favorites.some((f) => f.formula === entry.expression)
          const isHovered = hoveredLogId === entry.id

          return (
            <div
              key={entry.id}
              onMouseEnter={() => setHoveredLogId(entry.id)}
              onMouseLeave={() => setHoveredLogId(null)}
              style={{
                padding: '8px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: '#2563eb' }}>
                  {entry.roller}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {(isHovered || isFaved) && (
                    <button
                      onClick={() => {
                        if (isFaved) {
                          onUpdateFavorites(favorites.filter((f) => f.formula !== entry.expression))
                        } else {
                          onUpdateFavorites([...favorites, { name: generateFavoriteName(entry.expression), formula: entry.expression }])
                        }
                      }}
                      title={isFaved ? 'Remove from favorites' : 'Save to favorites'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24"
                        fill={isFaved ? '#f59e0b' : 'none'}
                        stroke={isFaved ? '#f59e0b' : '#d1d5db'}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  )}
                  <span style={{ color: '#999', fontSize: 11 }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ color: '#333' }}>{entry.expression}</span>
                {entry.resolvedExpression && (
                  <span style={{ color: '#999', fontSize: 11 }}> ({entry.resolvedExpression})</span>
                )}
                <span style={{ color: '#999', margin: '0 4px' }}>=</span>
                {entry.terms ? (
                  <span style={{ color: '#666' }}>
                    {entry.terms.map((tr, ti) => {
                      const sign = tr.term.sign === -1 ? '-' : '+'
                      const showSign = ti > 0 || tr.term.sign === -1
                      return (
                        <span key={ti}>
                          {showSign && <span style={{ color: '#999', margin: '0 2px' }}>{sign === '+' ? ' + ' : ' - '}</span>}
                          {tr.term.type === 'dice' ? (
                            <span>
                              [
                              {tr.allRolls.map((roll, ri) => (
                                <span key={ri}>
                                  {ri > 0 && ', '}
                                  <span style={
                                    tr.keptIndices.includes(ri)
                                      ? {}
                                      : { textDecoration: 'line-through', opacity: 0.4 }
                                  }>
                                    {roll}
                                  </span>
                                </span>
                              ))}
                              ]
                            </span>
                          ) : (
                            <span>{(tr.term as { type: 'constant'; value: number }).value}</span>
                          )}
                        </span>
                      )
                    })}
                  </span>
                ) : (
                  <span style={{ color: '#666' }}>
                    [{entry.rolls.join(', ')}]
                    {entry.modifier !== 0 && (
                      <span>{entry.modifier > 0 ? '+' : ''}{entry.modifier}</span>
                    )}
                  </span>
                )}
                <span style={{ color: '#999', margin: '0 4px' }}>=</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>
                  {entry.total}
                </span>
              </div>
            </div>
          )
        })}
        {logs.length === 0 && (
          <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>
            No rolls yet
          </div>
        )}
      </div>
    </div>
  )
}
