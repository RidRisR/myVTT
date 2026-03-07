import { useState, useEffect } from 'react'
import type { ChatRollMessage } from './chatTypes'
import { DiceReel, calcTotalAnimDuration } from './DiceReel'

interface DiceResultCardProps {
  message: ChatRollMessage
  isNew?: boolean
}

export function DiceResultCard({ message, isNew }: DiceResultCardProps) {
  const [totalRevealed, setTotalRevealed] = useState(!isNew)

  useEffect(() => {
    if (!isNew || totalRevealed) return
    const duration = calcTotalAnimDuration(message.terms) * 1000
    const timer = setTimeout(() => setTotalRevealed(true), duration)
    return () => clearTimeout(timer)
  }, [isNew, totalRevealed, message.terms])

  // Build dice reels with staggered delays
  let diceIndex = 0
  const reelGroups = message.terms.map((tr, ti) => {
    if (tr.term.type === 'constant') {
      const value = (tr.term as { type: 'constant'; sign: 1 | -1; value: number }).value
      const sign = tr.term.sign === -1 ? '-' : '+'
      return (
        <span key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {ti > 0 && <span style={{ color: '#94a3b8', margin: '0 2px', fontSize: 13 }}>{sign}</span>}
          <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: 15 }}>{value}</span>
        </span>
      )
    }

    const sign = tr.term.sign === -1 ? '-' : '+'
    const showSign = ti > 0 || tr.term.sign === -1
    const reels = tr.allRolls.map((roll, ri) => {
      const delay = diceIndex * 0.3
      diceIndex++
      const isDropped = !tr.keptIndices.includes(ri)
      return (
        <DiceReel
          key={`${ti}-${ri}`}
          sides={(tr.term as { type: 'dice'; sides: number }).sides}
          result={roll}
          delay={isNew ? delay : 0}
          dropped={isDropped}
        />
      )
    })

    return (
      <span key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {showSign && <span style={{ color: '#94a3b8', margin: '0 2px', fontSize: 13 }}>{sign}</span>}
        {reels}
      </span>
    )
  })

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(8px)',
        borderRadius: 10,
        padding: '10px 14px',
        animation: isNew ? 'notifSlideUp 0.3s ease-out' : undefined,
      }}
    >
      {/* Header: sender + formula */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: message.senderColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 11, color: '#94a3b8' }}>
          {message.senderName}
        </span>
        <span style={{ fontSize: 11, color: '#475569' }}>
          /r {message.expression}
          {message.resolvedExpression && (
            <span style={{ color: '#334155' }}> ({message.resolvedExpression})</span>
          )}
        </span>
        <span style={{ fontSize: 10, color: '#334155', marginLeft: 'auto' }}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Dice reels row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {reelGroups}

        {/* = Total */}
        <span style={{ color: '#475569', margin: '0 4px', fontSize: 14 }}>=</span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 22,
            color: totalRevealed ? '#f8fafc' : '#334155',
            fontFamily: 'monospace',
            minWidth: 30,
            textAlign: 'center',
            transition: 'color 0.3s, transform 0.3s',
            transform: totalRevealed ? 'scale(1)' : 'scale(0.8)',
            display: 'inline-block',
          }}
        >
          {totalRevealed ? message.total : '?'}
        </span>
      </div>
    </div>
  )
}
