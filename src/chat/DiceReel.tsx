import { useEffect, useMemo, useState } from 'react'

interface DiceReelProps {
  sides: number
  result: number
  /** Delay before this reel starts spinning (seconds) */
  delay: number
  /** Whether this die was dropped (keep/drop mechanic) */
  dropped?: boolean
}

const CELL_H = 30
const STRIP_LENGTH = 22

export function DiceReel({ sides, result, delay, dropped }: DiceReelProps) {
  const [spinning, setSpinning] = useState(false)
  const [landed, setLanded] = useState(false)

  // Generate a strip of random numbers ending with the result
  const strip = useMemo(() => {
    const items: number[] = []
    for (let i = 0; i < STRIP_LENGTH - 1; i++) {
      items.push(Math.ceil(Math.random() * sides))
    }
    items.push(result)
    return items
  }, [sides, result])

  const finalOffset = -(strip.length - 1) * CELL_H

  useEffect(() => {
    // Start spinning after delay
    const spinTimer = setTimeout(() => setSpinning(true), delay * 1000)
    // Mark as landed after spin completes
    const landTimer = setTimeout(() => setLanded(true), (delay + 0.9) * 1000)
    return () => {
      clearTimeout(spinTimer)
      clearTimeout(landTimer)
    }
  }, [delay])

  return (
    <div
      style={{
        width: 30,
        height: CELL_H,
        overflow: 'hidden',
        borderRadius: 5,
        background: dropped ? '#64748b' : '#1e293b',
        display: 'inline-block',
        position: 'relative',
        opacity: dropped && landed ? 0.4 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      <div
        style={{
          transform: spinning ? `translateY(${finalOffset}px)` : 'translateY(0)',
          transition: spinning ? 'transform 0.9s cubic-bezier(0.12, 0.8, 0.3, 1)' : 'none',
        }}
      >
        {strip.map((num, i) => (
          <div
            key={i}
            style={{
              height: CELL_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              fontFamily: 'monospace',
              textDecoration: dropped && i === strip.length - 1 && landed ? 'line-through' : 'none',
            }}
          >
            {num}
          </div>
        ))}
      </div>
      {/* Landing flash effect */}
      {landed && !dropped && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 5,
            border: '2px solid #60a5fa',
            animation: 'reelLand 0.4s ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}

/** Calculate total animation duration for a set of dice terms */
export function calcTotalAnimDuration(termResults: { term: { type: string }; allRolls: number[] }[]): number {
  let diceIndex = 0
  for (const tr of termResults) {
    if (tr.term.type === 'dice') {
      diceIndex += tr.allRolls.length
    }
  }
  // Each die has 0.3s stagger + 0.9s spin
  return diceIndex * 0.3 + 0.9 + 0.3 // extra 0.3s buffer for total reveal
}
