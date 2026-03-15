import { useEffect, useRef, useState } from 'react'

interface DiceReelProps {
  sides: number
  result: number
  /** When this die should stop spinning (seconds from mount) */
  stopDelay: number
  /** Whether this die was dropped (keep/drop mechanic) */
  dropped?: boolean
  /** Delay (seconds) before showing dropped styling — wait for all dice to land */
  dropRevealDelay?: number
  /** Custom die face color (hex, e.g. '#fbbf24'). Affects text, border, and glow. */
  color?: string
  /** Label shown above the die face (e.g. '希望') */
  label?: string
}

type Phase = 'spinning' | 'landing' | 'stopped'

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

export function DiceReel({
  sides,
  result,
  stopDelay,
  dropped = false,
  dropRevealDelay,
  color,
  label,
}: DiceReelProps) {
  // Lock animation params at mount — immune to later prop changes (e.g. isNew toggling)
  const initialRef = useRef({ stopDelay, result, sides, dropRevealDelay })
  const animate = initialRef.current.stopDelay > 0

  const [phase, setPhase] = useState<Phase>(animate ? 'spinning' : 'stopped')
  const [displayValue, setDisplayValue] = useState(animate ? 1 : result)
  const [showDropped, setShowDropped] = useState(!animate)

  useEffect(() => {
    if (!animate) return

    const {
      stopDelay: delay,
      result: finalValue,
      sides: s,
      dropRevealDelay: drd,
    } = initialRef.current

    // Phase 1: Spinning — cycle through shuffled faces (no repeats)
    const faces = Array.from({ length: s }, (_, i) => i + 1)
    let cursor = faces.length
    const shuffle = () => {
      if (cursor >= faces.length) {
        // Fisher-Yates shuffle
        for (let i = faces.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[faces[i], faces[j]] = [faces[j], faces[i]]
        }
        cursor = 0
      }
      setDisplayValue(faces[cursor++])
    }
    shuffle()
    const spinInterval = setInterval(shuffle, 50)

    // Phase 2: Stop and land
    const stopTimer = setTimeout(() => {
      clearInterval(spinInterval)
      setDisplayValue(finalValue)
      setPhase('landing')

      // Phase 3: Finish landing animation
      setTimeout(() => setPhase('stopped'), 300)
    }, delay * 1000)

    // Reveal dropped styling after all dice have landed
    let dropTimer: ReturnType<typeof setTimeout> | undefined
    if (drd != null && drd > 0) {
      dropTimer = setTimeout(() => setShowDropped(true), drd * 1000)
    }

    return () => {
      clearInterval(spinInterval)
      clearTimeout(stopTimer)
      if (dropTimer) clearTimeout(dropTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const faceColor = color ?? '#e2e8f0'
  const borderColor = color ? hexAlpha(color, 0.3) : 'rgba(96, 165, 250, 0.3)'
  const glowSpin = color ? hexAlpha(color, 0.5) : 'rgba(59, 130, 246, 0.5)'
  const glowLandOuter = color ? hexAlpha(color, 0.8) : 'rgba(59, 130, 246, 0.8)'
  const glowLandInner = color ? hexAlpha(color, 0.3) : 'rgba(96, 165, 250, 0.3)'

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    height: 32,
    padding: '0 8px',
    borderRadius: 6,
    background: 'rgba(30, 41, 59, 0.6)',
    border: `1px solid ${borderColor}`,
    color: faceColor,
    fontSize: 16,
    fontWeight: 600,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
    transition: 'opacity 0.3s, text-decoration 0.3s',
    opacity: dropped && showDropped ? 0.5 : 1,
    textDecoration: dropped && showDropped ? 'line-through' : 'none',
  }

  const phaseStyles: Record<Phase, React.CSSProperties> = {
    spinning: {
      ...baseStyle,
      filter: 'blur(1.5px)',
      boxShadow: `0 0 16px ${glowSpin}`,
    },
    landing: {
      ...baseStyle,
      filter: 'blur(0)',
      animation: 'diceLand 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      boxShadow: `0 0 20px ${glowLandOuter}, inset 0 0 8px ${glowLandInner}`,
    },
    stopped: baseStyle,
  }

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      {label && (
        <span className="text-[10px]" style={{ color: faceColor, opacity: 0.7 }}>
          {label}
        </span>
      )}
      <span style={phaseStyles[phase]}>{displayValue}</span>
    </span>
  )
}
