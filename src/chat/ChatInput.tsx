import { useState, useRef, useMemo } from 'react'
import { useValue, type Editor } from 'tldraw'
import { rollCompound, resolveFormula } from '../diceUtils'
import { readAttributes, readResources } from '../panel/tokenUtils'
import type { ChatMessage } from './chatTypes'

interface Suggestion {
  key: string
  value: string
  from: 'token' | 'seat'
}

interface ChatInputProps {
  editor: Editor | null
  senderId: string
  senderName: string
  senderColor: string
  seatProperties: { key: string; value: string }[]
  onSend: (message: ChatMessage) => void
}

function generateId(): string {
  return self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Build token properties from the new structured format (attributes + resources) */
function buildTokenProps(shape: { meta?: Record<string, unknown> } | null): { key: string; value: string }[] {
  if (!shape?.meta) return []
  const props: { key: string; value: string }[] = []
  for (const attr of readAttributes(shape.meta.attributes)) {
    props.push({ key: attr.key, value: String(attr.value) })
  }
  for (const res of readResources(shape.meta.resources)) {
    props.push({ key: res.key, value: `${res.current}/${res.max}` })
  }
  return props
}

export function ChatInput({ editor, senderId, senderName, senderColor, seatProperties, onSend }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reactively track selected token properties
  const selectedTokenProps = useValue('chatSelectedTokenProps', () => {
    const shapes = editor?.getSelectedShapes() ?? []
    const shape = shapes.length === 1 ? shapes[0] : null
    return buildTokenProps(shape as { meta?: Record<string, unknown> } | null)
  }, [editor])

  // Build available suggestions
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

  // Extract @prefix being typed at cursor
  const getAtPrefix = (): string | null => {
    const el = inputRef.current
    if (!el) return null
    const pos = el.selectionStart ?? input.length
    const before = input.slice(0, pos)
    const match = before.match(/@([\p{L}\p{N}_]*)$/u)
    return match ? match[1] : null
  }

  const atPrefix = showSuggestions ? getAtPrefix() : null
  const filteredSuggestions = atPrefix !== null
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
    requestAnimationFrame(() => {
      const newPos = atPos + 1 + key.length
      el.setSelectionRange(newPos, newPos)
      el.focus()
    })
  }

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return

    // Check if it's a dice roll
    const rollMatch = trimmed.match(/^\/r\s+(.+)$/i)
    if (rollMatch) {
      const formula = rollMatch[1].trim()
      handleRoll(formula)
    } else {
      // Text message
      onSend({
        type: 'text',
        id: generateId(),
        senderId,
        senderName,
        senderColor,
        content: trimmed,
        timestamp: Date.now(),
      })
      setInput('')
      setError('')
    }
  }

  const handleRoll = (formula: string) => {
    // Resolve @key references
    const tokenShapes = editor?.getSelectedShapes() ?? []
    const tokenShape = tokenShapes.length === 1 ? tokenShapes[0] : null
    const tokenProps = buildTokenProps(tokenShape as { meta?: Record<string, unknown> } | null)

    let expression = formula
    let resolvedExpression = formula

    if (/@[\p{L}\p{N}_]+/u.test(formula)) {
      const resolved = resolveFormula(formula, tokenProps, seatProperties)
      if ('error' in resolved) {
        const hint = !tokenShape ? ' (try selecting a token)' : ''
        setError(resolved.error + hint)
        return
      }
      expression = formula
      resolvedExpression = resolved.resolved
    }

    const result = rollCompound(resolvedExpression)
    if (!result) {
      setError('Invalid format. Examples: /r 1d20+5, /r 4d6kh3, /r 2d6+@STR')
      return
    }
    if ('error' in result) {
      setError(result.error)
      return
    }

    onSend({
      type: 'roll',
      id: generateId(),
      senderId,
      senderName,
      senderColor,
      expression,
      resolvedExpression: expression !== resolvedExpression ? resolvedExpression : undefined,
      terms: result.termResults,
      total: result.total,
      timestamp: Date.now(),
    })
    setInput('')
    setError('')
  }

  return (
    <div
      style={{ position: 'relative' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {error && (
        <div style={{
          color: '#fff',
          fontSize: 11,
          marginBottom: 4,
          padding: '4px 10px',
          background: 'rgba(220,38,38,0.9)',
          borderRadius: 6,
        }}>
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
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
          if (showSuggestions && filteredSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSuggestionIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1))
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSuggestionIndex((i) => Math.max(i - 1, 0))
              return
            }
            if (e.key === 'Tab') {
              e.preventDefault()
              applySuggestion(filteredSuggestions[suggestionIndex].key)
              return
            }
            if (e.key === 'Escape') {
              setShowSuggestions(false)
              return
            }
          }
          if (e.key === 'Enter') {
            if (showSuggestions && filteredSuggestions.length > 0) {
              e.preventDefault()
              applySuggestion(filteredSuggestions[suggestionIndex].key)
              return
            }
            handleSend()
          }
        }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder="Type a message or /r 1d20+@STR"
        style={{
          width: '100%',
          padding: '10px 14px',
          border: 'none',
          borderRadius: 10,
          fontSize: 13,
          boxSizing: 'border-box',
          outline: 'none',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
        }}
      />

      {/* @ autocomplete dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          marginBottom: 6,
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(8px)',
          borderRadius: 10,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
          maxHeight: 180,
          overflowY: 'auto',
        }}>
          {filteredSuggestions.map((s, i) => (
            <div
              key={s.key}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s.key) }}
              style={{
                padding: '7px 14px',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: i === suggestionIndex ? 'rgba(59,130,246,0.08)' : 'transparent',
              }}
            >
              <span>
                <span style={{ fontWeight: 600, color: '#333' }}>@{s.key}</span>
                <span style={{ color: '#999', marginLeft: 8 }}>{s.value}</span>
              </span>
              <span style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                background: s.from === 'token' ? '#fef3c7' : '#dbeafe',
                color: s.from === 'token' ? '#92400e' : '#1e40af',
              }}>
                {s.from}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
