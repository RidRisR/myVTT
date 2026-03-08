import { useEffect, useRef, useState } from 'react'

interface DiceReelProps {
  sides: number
  result: number
  /** When this die should stop spinning (seconds from mount) */
  stopDelay: number
  /** Whether this die was dropped (keep/drop mechanic) */
  dropped?: boolean
}

type Phase = 'spinning' | 'landing' | 'stopped'

const SPIN_DURATION = 0.8 // All dice spin for this long minimum
const STOP_INTERVAL = 0.2 // Each die stops 0.2s apart

export function DiceReel({ sides, result, stopDelay, dropped = false }: DiceReelProps) {
  // Lock animation params at mount — immune to later prop changes (e.g. isNew toggling)
  const initialRef = useRef({ stopDelay, result, sides })
  const animate = initialRef.current.stopDelay > 0

  const [phase, setPhase] = useState<Phase>(animate ? 'spinning' : 'stopped')
  const [displayValue, setDisplayValue] = useState(animate ? 1 : result)

  useEffect(() => {
    if (!animate) return

    const { stopDelay: delay, result: finalValue, sides: s } = initialRef.current

    // Phase 1: Spinning — rapidly change displayed number
    const spinInterval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * s) + 1)
    }, 50)

    // Phase 2: Stop and land
    const stopTimer = setTimeout(() => {
      clearInterval(spinInterval)
      setDisplayValue(finalValue)
      setPhase('landing')

      // Phase 3: Finish landing animation
      setTimeout(() => setPhase('stopped'), 300)
    }, delay * 1000)

    return () => {
      clearInterval(spinInterval)
      clearTimeout(stopTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    height: 32,
    padding: '0 8px',
    borderRadius: 6,
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(96, 165, 250, 0.3)',
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: 600,
    fontFamily: 'monospace',
    fontVariantNumeric: 'tabular-nums',
    opacity: dropped ? 0.5 : 1,
    textDecoration: dropped ? 'line-through' : 'none',
  }

  const phaseStyles: Record<Phase, React.CSSProperties> = {
    spinning: {
      ...baseStyle,
      filter: 'blur(1.5px)',
      boxShadow: '0 0 16px rgba(59, 130, 246, 0.5)',
    },
    landing: {
      ...baseStyle,
      filter: 'blur(0)',
      animation: 'diceLand 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      boxShadow:
        '0 0 20px rgba(59, 130, 246, 0.8), inset 0 0 8px rgba(96, 165, 250, 0.3)',
    },
    stopped: baseStyle,
  }

  return (
    <span style={phaseStyles[phase]}>
      {displayValue}
    </span>
  )
}

/** Calculate total animation duration for a set of dice terms */
export function calcTotalAnimDuration(
  termResults: { term: { type: string }; allRolls: number[] }[],
): number {
  let diceCount = 0
  for (const tr of termResults) {
    if (tr.term.type === 'dice') {
      diceCount += tr.allRolls.length
    }
  }
  if (diceCount === 0) return 0.5
  // spin + sequential stops + landing animation + buffer for total reveal
  const lastStopTime = SPIN_DURATION + (diceCount - 1) * STOP_INTERVAL
  return lastStopTime + 0.3 + 0.2 // landing (0.3s) + buffer before total (0.2s)
}
