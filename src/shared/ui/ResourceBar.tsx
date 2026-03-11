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
  /** Called when pointer-drag begins */
  onDragStart?: () => void
  /** Called on every move during drag (for awareness broadcast, NOT Yjs write) */
  onDragMove?: (value: number) => void
  /** Called on pointerUp to commit the final drag value (Yjs write) */
  onDragEnd?: (value: number) => void
  /** If a remote user is dragging this bar, display their live value */
  remoteDragValue?: number | null
  /** Soft-lock indicator color — shown when a remote user is editing */
  softLockColor?: string | null
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
  onDragStart,
  onDragMove,
  onDragEnd,
  remoteDragValue,
  softLockColor,
  className,
  style,
}: ResourceBarProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [localDragValue, setLocalDragValue] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // Determine displayed value: local drag > remote drag > committed
  const displayValue =
    localDragValue != null ? localDragValue : remoteDragValue != null ? remoteDragValue : current

  const handleBarDrag = (e: React.PointerEvent) => {
    if (!draggable) return
    // Need at least one of: onChange, onDragEnd
    if (!onChange && !onDragEnd) return
    e.preventDefault()
    e.stopPropagation()

    const bar = barRef.current
    if (!bar) return

    const rect = bar.getBoundingClientRect()

    const computeValue = (clientX: number) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.round(ratio * max)
    }

    const onMove = (moveEvent: PointerEvent) => {
      const newValue = computeValue(moveEvent.clientX)
      setLocalDragValue(newValue)
      // If awareness-aware: broadcast via onDragMove only
      if (onDragMove) {
        onDragMove(newValue)
      }
      // If NOT awareness-aware (legacy): write on every move
      if (!onDragMove && !onDragEnd && onChange) {
        onChange(newValue)
      }
    }

    const onUp = (upEvent: PointerEvent) => {
      const finalValue = computeValue(upEvent.clientX)
      setIsDragging(false)
      setLocalDragValue(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

      // Commit final value
      if (onDragEnd) {
        onDragEnd(finalValue)
      } else if (onChange) {
        onChange(finalValue)
      }
    }

    setIsDragging(true)
    onDragStart?.()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    // immediate update
    const initialValue = computeValue(e.nativeEvent.clientX)
    setLocalDragValue(initialValue)
    if (onDragMove) {
      onDragMove(initialValue)
    }
    if (!onDragMove && !onDragEnd && onChange) {
      onChange(initialValue)
    }
  }

  const handleIncrement = () => {
    if (!onChange) return
    onChange(Math.min(current + 1, max))
  }

  const handleDecrement = () => {
    if (!onChange) return
    onChange(Math.max(current - 1, 0))
  }

  const percentage = max > 0 ? (displayValue / max) * 100 : 0
  const radius = Math.min(height / 2, 8)
  const inlineFontSize = Math.max(8, height * 0.5)

  // Soft lock: show ring when a remote user is editing
  const isRemoteLocked = !!softLockColor && !isDragging

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
            <span style={{ color: isRemoteLocked ? softLockColor! : color }}>
              {displayValue} / {max}
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
        {showButtons && <MiniHoldButton label="-" onTick={handleDecrement} color="#ef4444" />}

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
            // Soft lock ring
            boxShadow: isRemoteLocked
              ? `0 0 0 2px ${softLockColor}, 0 0 8px ${softLockColor}66`
              : undefined,
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
              transition: isDragging || remoteDragValue != null ? 'none' : 'width 0.2s ease',
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
              {displayValue} / {max}
            </div>
          )}

          {/* Soft lock dot indicator (top-right) */}
          {isRemoteLocked && (
            <div
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: softLockColor!,
                boxShadow: `0 0 4px ${softLockColor}`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}
        </div>

        {showButtons && <MiniHoldButton label="+" onTick={handleIncrement} color="#22c55e" />}
      </div>
    </div>
  )
}
