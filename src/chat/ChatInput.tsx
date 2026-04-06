import { useState, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import type { ChatMessage, MessageOrigin } from '../shared/chatTypes'
import type { WorkflowHandle } from '../workflow/types'
import { getCommand } from '../workflow/commandRegistry'
import { parseCommand } from '../shared/commandUtils'

interface Suggestion {
  key: string
  value: string
  from: 'token' | 'seat'
}

interface ChatInputProps {
  origin: MessageOrigin
  selectedTokenProps: { key: string; value: string }[]
  seatProperties: { key: string; value: string }[]
  onSend: (message: ChatMessage) => void
  onCommand?: (handle: WorkflowHandle, raw: string) => void
  onFocus?: () => void
  onCycleSpeaker?: () => void
}

function generateId(): string {
  return self.crypto.randomUUID()
}

export function ChatInput({
  origin,
  selectedTokenProps,
  seatProperties,
  onSend,
  onCommand,
  onFocus,
  onCycleSpeaker,
}: ChatInputProps) {
  const { t } = useTranslation('chat')
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Build available suggestions
  const suggestions = useMemo((): Suggestion[] => {
    const items: Suggestion[] = []
    const seen = new Set<string>()
    for (const p of selectedTokenProps) {
      if (!seen.has(p.key)) {
        items.push({ key: p.key, value: p.value, from: 'token' })
        seen.add(p.key)
      }
    }
    for (const p of seatProperties) {
      if (!seen.has(p.key)) {
        items.push({ key: p.key, value: p.value, from: 'seat' })
        seen.add(p.key)
      }
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
    return match ? (match[1] ?? '') : null
  }

  const atPrefix = showSuggestions ? getAtPrefix() : null
  const filteredSuggestions =
    atPrefix !== null
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

    // Command detection via parseCommand utility
    const cmd = parseCommand(trimmed)
    if (cmd && onCommand) {
      const handle = getCommand(cmd.name)
      if (handle) {
        onCommand(handle, cmd.raw)
        setInput('')
        setError('')
        return
      }
      // Unknown command — fall through to text
    }

    // Text message
    onSend({
      type: 'text',
      id: generateId(),
      origin,
      content: trimmed,
      timestamp: Date.now(),
    })
    setInput('')
    setError('')
  }

  return (
    <div
      className="relative"
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      {error && (
        <div className="text-white text-[11px] mb-1 px-2.5 py-1 bg-danger/90 rounded-md">
          {error}
        </div>
      )}
      <div className="flex">
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
                applySuggestion(filteredSuggestions[suggestionIndex]?.key ?? '')
                return
              }
              if (e.key === 'Escape') {
                setShowSuggestions(false)
                return
              }
            }
            if (e.key === 'Tab' && onCycleSpeaker) {
              e.preventDefault()
              onCycleSpeaker()
              return
            }
            if (e.key === 'Enter') {
              if (showSuggestions && filteredSuggestions.length > 0) {
                e.preventDefault()
                applySuggestion(filteredSuggestions[suggestionIndex]?.key ?? '')
                return
              }
              handleSend()
            }
          }}
          onFocus={onFocus}
          onBlur={() =>
            setTimeout(() => {
              setShowSuggestions(false)
            }, 150)
          }
          placeholder={t('input_placeholder')}
          data-testid="chat-input"
          className="flex-1 min-w-0 px-3.5 py-2.5 border-none rounded-l-[10px] text-[13px] outline-none bg-surface backdrop-blur-[8px] text-text-primary placeholder:text-text-muted shadow-[0_2px_12px_rgba(0,0,0,0.2)]"
        />
        <button
          onClick={handleSend}
          className="px-3.5 border-none rounded-r-[10px] text-sm cursor-pointer bg-accent text-deep font-semibold transition-colors duration-fast shrink-0 hover:bg-accent-bold flex items-center justify-center"
          aria-label={t('send')}
        >
          <Send size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* @ autocomplete dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          data-testid="autocomplete-dropdown"
          className="absolute bottom-full left-0 right-0 mb-1.5 bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_-4px_16px_rgba(0,0,0,0.3)] max-h-[180px] overflow-y-auto"
        >
          {filteredSuggestions.map((s, i) => (
            <div
              key={s.key}
              onMouseDown={(e) => {
                e.preventDefault()
                applySuggestion(s.key)
              }}
              className={`px-3.5 py-[7px] cursor-pointer text-xs flex justify-between items-center transition-colors duration-fast ${
                i === suggestionIndex ? 'bg-accent/10' : 'bg-transparent hover:bg-hover'
              }`}
            >
              <span>
                <span className="font-semibold text-text-primary">@{s.key}</span>
                <span className="text-text-muted ml-2">{s.value}</span>
              </span>
              <span
                className={`text-[9px] px-[5px] py-px rounded-[3px] ${
                  s.from === 'token' ? 'bg-warning/20 text-warning' : 'bg-info/20 text-info'
                }`}
              >
                {s.from}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
