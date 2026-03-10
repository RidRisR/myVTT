import type { JudgmentDisplay } from '../rules/types'

interface JudgmentBadgeProps {
  display: JudgmentDisplay
  animate?: boolean
}

const severityAnimations: Record<JudgmentDisplay['severity'], string> = {
  critical: 'judgmentPulse 1.5s ease-in-out infinite',
  success: 'judgmentPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  partial: 'judgmentPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
  failure: 'judgmentShake 0.4s ease-in-out',
  fumble: 'judgmentShake 0.5s ease-in-out',
}

export function JudgmentBadge({ display, animate = true }: JudgmentBadgeProps) {
  return (
    <>
      <style>{`
        @keyframes judgmentPulse {
          0%, 100% { box-shadow: 0 0 8px ${display.color}66; }
          50% { box-shadow: 0 0 20px ${display.color}CC; }
        }
        @keyframes judgmentPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes judgmentShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
      `}</style>
      <span
        style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          color: display.color,
          background: `${display.color}1A`,
          border: `1px solid ${display.color}33`,
          animation: animate ? severityAnimations[display.severity] : 'none',
          letterSpacing: 0.3,
        }}
      >
        {display.text}
      </span>
    </>
  )
}
