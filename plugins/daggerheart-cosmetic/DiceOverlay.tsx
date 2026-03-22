import { useEffect, useState } from 'react'

interface DiceOverlayProps {
  rolls: number[][]
  judgment: { type: string; outcome: string } | null
  onComplete: () => void
}

const OUTCOME_COLORS: Record<string, string> = {
  critical_success: '#a78bfa',
  success_hope: '#fbbf24',
  success_fear: '#f97316',
  failure_hope: '#60a5fa',
  failure_fear: '#ef4444',
}

export function DiceOverlay({ rolls, judgment, onComplete }: DiceOverlayProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onComplete()
    }, 1500)
    return () => {
      clearTimeout(timer)
    }
  }, [onComplete])

  if (!visible || !rolls[0]) return null

  const color = judgment ? (OUTCOME_COLORS[judgment.outcome] ?? '#fff') : '#fff'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      <div className="animate-bounce text-6xl font-bold font-sans tabular-nums" style={{ color }}>
        {rolls[0].join(' + ')}
      </div>
    </div>
  )
}
