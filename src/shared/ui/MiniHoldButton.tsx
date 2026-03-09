import { useHoldRepeat } from '../useHoldRepeat'

interface MiniHoldButtonProps {
  label: string
  onTick: () => void
  color: string
}

export function MiniHoldButton({ label, onTick, color }: MiniHoldButtonProps) {
  const { holdStart, holdStop } = useHoldRepeat(onTick)
  return (
    <button
      onPointerDown={holdStart}
      onPointerUp={holdStop}
      onPointerLeave={holdStop}
      style={{
        width: 20,
        height: 20,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4,
        cursor: 'pointer',
        color,
        fontSize: 11,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        lineHeight: 1,
        flexShrink: 0,
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      }}
    >
      {label}
    </button>
  )
}
