import { useState, useRef, useEffect } from 'react'
import type { RollAction, ModifierOption, RollContext } from '../rules/types'
import { MiniHoldButton } from '../shared/ui/MiniHoldButton'

interface RollConfirmPanelProps {
  action: RollAction
  resolvedFormula: string
  modifierOptions: ModifierOption[]
  onConfirm: (context: RollContext) => void
  onCancel: () => void
}

export function RollConfirmPanel({
  action,
  resolvedFormula,
  modifierOptions,
  onConfirm,
  onCancel,
}: RollConfirmPanelProps) {
  const [dc, setDc] = useState<string>('')
  const [tempModifier, setTempModifier] = useState(0)
  const [activeModifiers, setActiveModifiers] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onCancel])

  const handleConfirm = () => {
    const dcNum = dc.trim() ? parseInt(dc) : undefined
    onConfirm({
      dc: dcNum && !isNaN(dcNum) ? dcNum : undefined,
      activeModifierIds: [...activeModifiers],
      tempModifier,
    })
  }

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') handleConfirm()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel, handleConfirm])

  const toggleModifier = (id: string) => {
    setActiveModifiers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        // Handle mutual exclusivity
        const opt = modifierOptions.find((o) => o.id === id)
        if (opt?.mutuallyExclusiveWith) next.delete(opt.mutuallyExclusiveWith)
        next.add(id)
      }
      return next
    })
  }

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    fontSize: 13,
    background: 'rgba(255,255,255,0.06)',
    color: '#e4e4e7',
    outline: 'none',
    textAlign: 'center',
    width: 50,
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 320,
          background: 'rgba(15, 15, 25, 0.92)',
          backdropFilter: 'blur(16px)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          padding: '20px 24px',
          fontFamily: 'sans-serif',
          color: '#e4e4e7',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{action.name}</div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'monospace',
            marginBottom: 16,
          }}
        >
          {resolvedFormula}
          {tempModifier !== 0 && (
            <span style={{ color: tempModifier > 0 ? '#22c55e' : '#ef4444' }}>
              {tempModifier > 0 ? `+${tempModifier}` : tempModifier}
            </span>
          )}
        </div>

        {/* DC input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', minWidth: 24 }}>DC</span>
          <input
            value={dc}
            onChange={(e) => setDc(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="—"
            style={inputStyle}
          />
        </div>

        {/* Temp modifier */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', minWidth: 24 }}>Mod</span>
          <MiniHoldButton label="−" onTick={() => setTempModifier((v) => v - 1)} color="#ef4444" />
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: 'monospace',
              minWidth: 30,
              textAlign: 'center',
              color: tempModifier === 0 ? '#94a3b8' : tempModifier > 0 ? '#22c55e' : '#ef4444',
            }}
          >
            {tempModifier >= 0 ? `+${tempModifier}` : tempModifier}
          </span>
          <MiniHoldButton label="+" onTick={() => setTempModifier((v) => v + 1)} color="#22c55e" />
        </div>

        {/* Modifier options */}
        {modifierOptions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {modifierOptions.map((opt) => {
              const active = activeModifiers.has(opt.id)
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleModifier(opt.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: active
                      ? '1px solid rgba(59,130,246,0.5)'
                      : '1px solid rgba(255,255,255,0.1)',
                    background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#93c5fd' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'rgba(59,130,246,0.8)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Roll
          </button>
        </div>
      </div>
    </div>
  )
}
