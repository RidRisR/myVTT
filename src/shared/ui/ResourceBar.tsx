import { useState, useRef } from 'react'
import { MiniHoldButton } from './MiniHoldButton'

interface ResourceBarProps {
  label?: string
  current: number
  max: number
  color: string
  height?: number
  showLabel?: boolean
  valueDisplay?: 'none' | 'outside' | 'inline'
  draggable?: boolean
  showButtons?: boolean
  onChange?: (newCurrent: number) => void
  className?: string
  style?: React.CSSProperties
}

export function ResourceBar({
  label,
  current,
  max,
  color,
  height = 8,
  showLabel = false,
  valueDisplay = 'none',
  draggable = false,
  showButtons = false,
  onChange,
  className,
  style,
}: ResourceBarProps) {
  const [isDragging, setIsDragging] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const handleBarDrag = (e: React.PointerEvent) => {
    if (!draggable || !onChange) return
    e.preventDefault()
    e.stopPropagation()

    const bar = barRef.current
    if (!bar) return

    const rect = bar.getBoundingClientRect()

    const onMove = (moveEvent: PointerEvent) => {
      const x = moveEvent.clientX
      const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width))
      const newValue = Math.round(ratio * max)
      onChange(newValue)
    }

    const onUp = () => {
      setIsDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    setIsDragging(true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    // immediate update
    onMove(e.nativeEvent)
  }

  const handleIncrement = () => {
    if (!onChange) return
    onChange(Math.min(current + 1, max))
  }

  const handleDecrement = () => {
    if (!onChange) return
    onChange(Math.max(current - 1, 0))
  }

  const percentage = max > 0 ? (current / max) * 100 : 0
  const radius = Math.min(height / 2, 8)
  const inlineFontSize = Math.max(8, height * 0.5)

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        ...style,
      }}
    >
      {/* Label + Outside Value */}
      {(showLabel || valueDisplay === 'outside') && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {showLabel && <span>{label}</span>}
          {valueDisplay === 'outside' && (
            <span style={{ color }}>
              {current} / {max}
            </span>
          )}
        </div>
      )}

      {/* Bar + Buttons Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {showButtons && (
          <MiniHoldButton label="-" onTick={handleDecrement} color="#ef4444" />
        )}

        {/* Progress Bar */}
        <div
          ref={barRef}
          onPointerDown={handleBarDrag}
          style={{
            position: 'relative',
            height,
            borderRadius: radius,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
            cursor: draggable ? 'ew-resize' : 'default',
            flex: showButtons ? 1 : undefined,
            width: showButtons ? undefined : '100%',
          }}
        >
          {/* Fill */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${percentage}%`,
              background: `linear-gradient(90deg, ${color}, ${color}cc)`,
              transition: isDragging ? 'none' : 'width 0.2s ease',
            }}
          />

          {/* Inline Value */}
          {valueDisplay === 'inline' && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: inlineFontSize,
                fontWeight: 700,
                color: '#fff',
                textShadow: '0 0 4px rgba(0,0,0,0.8)',
                pointerEvents: 'none',
              }}
            >
              {current} / {max}
            </div>
          )}
        </div>

        {showButtons && (
          <MiniHoldButton label="+" onTick={handleIncrement} color="#22c55e" />
        )}
      </div>
    </div>
  )
}
