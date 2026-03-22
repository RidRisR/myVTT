import { useState } from 'react'
import type { ComponentProps, DnDPayload } from '../../src/ui-system/types'

interface CardDef {
  id: string
  label: string
}

// Draggable cards available in every panel instance
const CARDS: CardDef[] = [
  { id: 'fire-bolt', label: '🔥 火球术' },
  { id: 'ice-arrow', label: '❄️ 冰矢' },
  { id: 'shield', label: '🛡️ 盾牌' }, // will be rejected by drop zone
]

export function HelloPanel({ sdk }: ComponentProps) {
  const { layoutMode } = sdk.context
  const [droppedLabel, setDroppedLabel] = useState<string | null>(null)
  // null = not hovering; true = hovering + accepted; false = hovering + rejected
  const [hoverState, setHoverState] = useState<boolean | null>(null)

  const dropProps = sdk.interaction?.dnd.makeDropZone({
    accept: ['card'],
    // Reject 'shield' — demonstrates receiver-side canDrop control
    canDrop: (payload: DnDPayload) => (payload.data as CardDef).id !== 'shield',
    onEnter: (canAccept) => {
      setHoverState(canAccept)
    },
    onLeave: () => {
      setHoverState(null)
    },
    onDrop: (payload: DnDPayload) => {
      setHoverState(null)
      setDroppedLabel((payload.data as CardDef).label)
    },
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#e2e8f0',
        fontSize: 13,
      }}
    >
      {/* play 模式：自定义把手，只有标题栏可拖 */}
      {layoutMode === 'play' && (
        <div
          onMouseDown={(e) => sdk.interaction?.layout.startDrag(e)}
          style={{
            padding: '4px 10px',
            background: 'rgba(99,102,241,0.2)',
            borderBottom: '1px solid rgba(99,102,241,0.3)',
            fontSize: 11,
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          ⠿ Hello Panel
        </div>
      )}

      <div
        style={{
          padding: '8px 10px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflow: 'hidden',
        }}
      >
        {/* Draggable cards */}
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>
            可拖动卡牌 →
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CARDS.map((card) => {
              const dragProps =
                sdk.interaction?.dnd.makeDraggable({ type: 'card', data: card }) ?? {}
              return (
                <div
                  key={card.id}
                  {...dragProps}
                  style={{
                    padding: '3px 7px',
                    background: '#374151',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 3,
                    cursor: 'grab',
                    fontSize: 11,
                    userSelect: 'none',
                  }}
                >
                  {card.label}
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
            ※ 盾牌会被 drop zone 拒绝
          </div>
        </div>

        {/* Drop zone — color reflects canDrop result */}
        <div
          {...dropProps}
          style={{
            flex: 1,
            border: `1.5px dashed ${
              hoverState === true
                ? '#22c55e' // green: accepted
                : hoverState === false
                  ? '#ef4444' // red: rejected
                  : 'rgba(255,255,255,0.15)' // idle
            }`,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color:
              hoverState === true
                ? '#86efac'
                : hoverState === false
                  ? '#fca5a5'
                  : 'rgba(255,255,255,0.3)',
            background:
              hoverState === true
                ? 'rgba(34,197,94,0.07)'
                : hoverState === false
                  ? 'rgba(239,68,68,0.07)'
                  : 'transparent',
            transition: 'border-color 0.1s, color 0.1s, background 0.1s',
          }}
        >
          {hoverState === false
            ? '✗ 不接受此卡牌'
            : droppedLabel
              ? `✓ ${droppedLabel}`
              : '拖卡牌到此处'}
        </div>
      </div>
    </div>
  )
}
