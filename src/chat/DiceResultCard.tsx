import { useState, useEffect, useRef, useMemo } from 'react'
import type { ChatRollMessage } from './chatTypes'
import { DiceReel } from './DiceReel'
import { calcTotalAnimDuration, SPIN_DURATION, STOP_INTERVAL } from './diceAnimUtils'
import { tokenizeExpression, buildCompoundResult } from '../shared/diceUtils'

interface DiceResultCardProps {
  message: ChatRollMessage
  isNew?: boolean
}

export function DiceResultCard({ message, isNew }: DiceResultCardProps) {
  // Lock animation state at mount — immune to isNew prop changes
  const shouldAnimate = useRef(!!isNew)

  // Reconstruct termResults + total from server-generated rolls (client-side computation)
  const { termResults, total } = useMemo(() => {
    const formula = message.resolvedFormula ?? message.formula
    const terms = tokenizeExpression(formula) ?? []
    return buildCompoundResult(terms, message.rolls ?? [])
  }, [message.formula, message.resolvedFormula, message.rolls])

  const [totalRevealed, setTotalRevealed] = useState(!shouldAnimate.current)

  useEffect(() => {
    if (!shouldAnimate.current) return
    const duration = calcTotalAnimDuration(termResults) * 1000
    const timer = setTimeout(() => setTotalRevealed(true), duration)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDice = termResults.reduce(
    (sum, tr) => sum + (tr.term.type === 'dice' ? tr.allRolls.length : 0),
    0,
  )
  const stopOrder = useRef(
    Array.from({ length: totalDice }, (_, i) => i).sort(() => Math.random() - 0.5),
  )
  const allLandedTime = totalDice > 0 ? SPIN_DURATION + (totalDice - 1) * STOP_INTERVAL + 0.3 : 0

  let diceIndex = 0
  const reelGroups = termResults.map((tr, ti) => {
    if (tr.term.type === 'constant') {
      const value = (tr.term as { type: 'constant'; sign: 1 | -1; value: number }).value
      const sign = tr.term.sign === -1 ? '-' : '+'
      return (
        <span key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {ti > 0 && (
            <span style={{ color: '#64748b', margin: '0 2px', fontSize: 13 }}>{sign}</span>
          )}
          <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 15 }}>{value}</span>
        </span>
      )
    }

    const sign = tr.term.sign === -1 ? '-' : '+'
    const showSign = ti > 0 || tr.term.sign === -1
    const reels = tr.allRolls.map((roll, ri) => {
      const order = stopOrder.current[diceIndex] ?? diceIndex
      const stopDelay = SPIN_DURATION + order * STOP_INTERVAL
      diceIndex++
      const isDropped = !tr.keptIndices.includes(ri)
      return (
        <DiceReel
          key={`${ti}-${ri}`}
          sides={(tr.term as { type: 'dice'; sides: number }).sides}
          result={roll}
          stopDelay={shouldAnimate.current ? stopDelay : 0}
          dropped={isDropped}
          dropRevealDelay={shouldAnimate.current ? allLandedTime : undefined}
        />
      )
    })

    return (
      <span
        key={ti}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}
      >
        {showSign && (
          <span style={{ color: '#64748b', margin: '0 2px', fontSize: 13 }}>{sign}</span>
        )}
        {reels}
      </span>
    )
  })

  return (
    <>
      <style>{`
        @keyframes diceLand {
          0% { transform: scale(1) rotateZ(0deg); filter: blur(1.5px); }
          50% { transform: scale(1.3) rotateZ(8deg); filter: blur(0); }
          70% { transform: scale(0.95) rotateZ(-4deg); }
          100% { transform: scale(1) rotateZ(0deg); filter: blur(0); }
        }
        @keyframes totalReveal {
          0% { opacity: 0; transform: scale(0.5) translateY(8px); }
          50% { transform: scale(1.2) translateY(-2px); }
          70% { transform: scale(0.95) translateY(1px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {reelGroups}
        <span style={{ color: '#475569', margin: '0 4px', fontSize: 14 }}>=</span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 22,
            fontFamily: 'monospace',
            minWidth: 30,
            textAlign: 'center',
            display: 'inline-block',
            ...(totalRevealed
              ? {
                  color: '#fbbf24',
                  textShadow: '0 0 10px rgba(251, 191, 36, 0.8), 0 0 20px rgba(251, 191, 36, 0.4)',
                  animation: shouldAnimate.current
                    ? 'totalReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    : 'none',
                  opacity: 1,
                }
              : { color: '#334155', opacity: 0.5 }),
          }}
        >
          {totalRevealed ? total : '?'}
        </span>
      </div>
    </>
  )
}
