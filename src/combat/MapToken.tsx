import type { CombatToken } from './combatTypes'
import { TokenOverlay } from './TokenOverlay'

interface MapTokenProps {
  token: CombatToken
  pixelSize: number
  selected: boolean
  gmOnly: boolean
  dragging: boolean
  dragX?: number
  dragY?: number
  onPointerDown: (e: React.PointerEvent, tokenId: string) => void
  onClick: (tokenId: string) => void
}

export function MapToken({
  token,
  pixelSize,
  selected,
  gmOnly,
  dragging,
  dragX,
  dragY,
  onPointerDown,
  onClick,
}: MapTokenProps) {
  const x = dragging && dragX !== undefined ? dragX : token.x
  const y = dragging && dragY !== undefined ? dragY : token.y

  return (
    <div
      className="combat-token"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: pixelSize,
        height: pixelSize,
        cursor: 'pointer',
        zIndex: dragging ? 100 : 1,
        transition: dragging ? 'none' : 'left 0.1s ease, top 0.1s ease',
      }}
      onPointerDown={(e) => onPointerDown(e, token.id)}
      onClick={(e) => { e.stopPropagation(); onClick(token.id) }}
    >
      {/* Token image */}
      <div style={{
        width: pixelSize,
        height: pixelSize,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `3px solid ${selected ? '#fff' : token.color}`,
        boxShadow: selected
          ? `0 0 0 2px ${token.color}, 0 0 16px ${token.color}66`
          : `0 2px 8px rgba(0,0,0,0.4)`,
        opacity: gmOnly ? 0.5 : 1,
        borderStyle: gmOnly ? 'dashed' : 'solid',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        <img
          src={token.imageUrl}
          alt={token.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            userSelect: 'none',
            display: 'block',
          }}
          draggable={false}
        />
      </div>

      {/* Overlay below token */}
      <div style={{
        position: 'absolute',
        top: pixelSize + 2,
        left: '50%',
        transform: 'translateX(-50%)',
      }}>
        <TokenOverlay token={token} />
      </div>
    </div>
  )
}
