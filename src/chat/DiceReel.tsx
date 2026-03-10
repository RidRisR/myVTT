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
  /** Override border/glow color (e.g. Hope=gold, Fear=purple) */
  color?: string
  /** Tiny label below the die (e.g. "Hope", "Fear") */
  label?: string
}

type Phase = 'spinning' | 'landing' | 'stopped'

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

  const borderColor = color ? `${color}4D` : 'rgba(96, 165, 250, 0.3)'
  const glowColor = color ?? 'rgba(59, 130, 246, 1)'

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
    color: '#e2e8f0',
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
      boxShadow: `0 0 16px ${glowColor}80`,
    },
    landing: {
      ...baseStyle,
      filter: 'blur(0)',
      animation: 'diceLand 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      boxShadow: `0 0 20px ${glowColor}CC, inset 0 0 8px ${glowColor}4D`,
    },
    stopped: baseStyle,
  }

  const dieEl = <span style={phaseStyles[phase]}>{displayValue}</span>

  if (!label) return dieEl

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {dieEl}
      <span
        style={{
          fontSize: 8,
          color: color ?? '#94a3b8',
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </span>
  )
}
