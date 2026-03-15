import { useState, useEffect, useRef, useMemo } from 'react'
import type { ChatRollMessage } from './chatTypes'
import type { DieConfig } from '../rules/types'
import { DiceReel } from './DiceReel'
import { calcTotalAnimDuration, SPIN_DURATION, STOP_INTERVAL } from './diceAnimUtils'
import { tokenizeExpression, buildCompoundResult } from '../shared/diceUtils'

interface DiceResultCardProps {
  message: ChatRollMessage
  isNew?: boolean
}

interface DiceAnimContentProps {
  message: ChatRollMessage
  isNew: boolean
  dieConfigs?: DieConfig[]
  footer?: { text: string; color: string }
  totalColor?: string
}

function hexGlow(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `0 0 10px rgba(${r},${g},${b},0.8), 0 0 20px rgba(${r},${g},${b},0.4)`
}

/** Shared animation body — used by DiceResultCard (base) and injected as renderDice for plugins */
export function DiceAnimContent({ message, isNew, dieConfigs, footer, totalColor }: DiceAnimContentProps) {
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
    const timer = setTimeout(() => {
      setTotalRevealed(true)
    }, duration)
    return () => {
      clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDice = termResults.reduce(
    (sum, tr) => sum + (tr.term.type === 'dice' ? tr.allRolls.length : 0),
    0,
  )
  // stopOrder is frozen at mount — each message gets its own instance
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
        <span key={ti} className="inline-flex items-center gap-1">
          {ti > 0 && (
            <span className="text-text-muted mx-0.5 text-[13px]">{sign}</span>
          )}
          <span className="text-text-muted font-semibold text-[15px]">{value}</span>
        </span>
      )
    }

    const sign = tr.term.sign === -1 ? '-' : '+'
    const showSign = ti > 0 || tr.term.sign === -1
    const reels = tr.allRolls.map((roll, ri) => {
      const order = stopOrder.current[diceIndex] ?? diceIndex
      const stopDelay = SPIN_DURATION + order * STOP_INTERVAL
      const cfg = dieConfigs?.[diceIndex]
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
          color={cfg?.color}
          label={cfg?.label}
        />
      )
    })

    return (
      <span key={ti} className="inline-flex items-center gap-0.5 flex-wrap">
        {showSign && (
          <span className="text-text-muted mx-0.5 text-[13px]">{sign}</span>
        )}
        {reels}
      </span>
    )
  })

  return (
    <div className="flex items-end gap-1 flex-wrap justify-center">
      {reelGroups}
      <span className="inline-flex items-center h-8 text-text-muted mx-1 text-[14px]">=</span>
      <span
        className={`inline-flex items-center justify-center h-8 font-extrabold text-[22px] font-mono min-w-[30px] ${
          totalRevealed ? (totalColor ? '' : 'text-accent') : 'text-[#334155] opacity-50'
        }`}
        style={
          totalRevealed
            ? {
                color: totalColor,
                textShadow: totalColor
                  ? hexGlow(totalColor)
                  : '0 0 10px rgba(251, 191, 36, 0.8), 0 0 20px rgba(251, 191, 36, 0.4)',
                animation: shouldAnimate.current
                  ? 'totalReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  : undefined,
              }
            : undefined
        }
      >
        {totalRevealed ? total : '?'}
      </span>
      {footer && (
        <span
          className="inline-flex items-center h-8 text-xs font-semibold px-2 py-1 rounded ml-1"
          style={{
            color: footer.color,
            background: `${footer.color}22`,
            opacity: totalRevealed ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {footer.text}
        </span>
      )}
    </div>
  )
}

export function DiceResultCard({ message, isNew }: DiceResultCardProps) {
  return <DiceAnimContent message={message} isNew={!!isNew} />
}
