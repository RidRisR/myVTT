import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Character } from '../shared/characterTypes'
import { statusColor } from '../shared/tokenUtils'
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu'

type PortraitTabId = 'characters' | 'initiative'

interface PortraitBarProps {
  characters: Character[]
  mySeatId: string | null
  isGM: boolean
  onlineSeatIds: Set<string>
  inspectedCharacterId: string | null
  activeCharacterId: string | null
  onInspectCharacter: (charId: string | null) => void
  onSetActiveCharacter: (charId: string) => void
  onDeleteCharacter: (charId: string) => void
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void
}

const PORTRAIT_SIZE = 52
const IMG_SIZE = 36
const RING_GAP = 2
const RING_WIDTH = 3

function ResourceRing({ index, pct, color, size }: { index: number; pct: number; color: string; size: number }) {
  const radius = size / 2 - RING_WIDTH / 2 - index * (RING_WIDTH + RING_GAP)
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, pct)))

  return (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={RING_WIDTH}
      strokeDasharray={circumference}
      strokeDashoffset={offset}
      strokeLinecap="round"
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
      style={{ transition: 'stroke-dashoffset 0.3s ease' }}
    />
  )
}

function ResourceRingBg({ index, size }: { index: number; size: number }) {
  const radius = size / 2 - RING_WIDTH / 2 - index * (RING_WIDTH + RING_GAP)
  return (
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke="rgba(255,255,255,0.08)"
      strokeWidth={RING_WIDTH}
    />
  )
}

export function PortraitBar({
  characters,
  mySeatId,
  isGM,
  onlineSeatIds,
  inspectedCharacterId,
  activeCharacterId,
  onInspectCharacter,
  onSetActiveCharacter,
  onDeleteCharacter,
  onUpdateCharacter,
}: PortraitBarProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; charId: string } | null>(null)
  const [activeTab, setActiveTab] = useState<PortraitTabId>('characters')

  if (characters.length === 0) return null

  // Characters tab: PCs always + featured NPCs only
  const featuredChars = characters.filter(c => c.type === 'pc' || (c.type === 'npc' && c.featured))
  const pcChars = featuredChars.filter(c => c.type === 'pc')
  const npcChars = featuredChars.filter(c => c.type === 'npc')
  const hasSection = pcChars.length > 0 && npcChars.length > 0

  const handleContextMenu = (e: React.MouseEvent, charId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, charId })
  }

  const getContextMenuItems = (char: Character): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []

    if (char.type === 'pc' && char.seatId === mySeatId) {
      items.push({
        label: 'Set as active',
        onClick: () => onSetActiveCharacter(char.id),
        disabled: activeCharacterId === char.id,
      })
    }

    items.push({
      label: 'Inspect',
      onClick: () => onInspectCharacter(char.id),
    })

    if (isGM && char.type === 'npc') {
      items.push({
        label: char.featured ? 'Hide from portraits' : 'Show in portraits',
        onClick: () => onUpdateCharacter(char.id, { featured: !char.featured }),
      })
      items.push({
        label: 'Remove from scene',
        onClick: () => onDeleteCharacter(char.id),
        color: '#f87171',
      })
    }

    return items
  }

  const renderPortrait = (char: Character) => {
    const isMine = char.type === 'pc' && char.seatId === mySeatId
    const isOnline = isMine || (char.seatId ? onlineSeatIds.has(char.seatId) : false)
    const isInspected = inspectedCharacterId === char.id
    const isActive = activeCharacterId === char.id

    const resources = char.resources.filter(r => r.max > 0)
    const displayResources = resources.slice(0, 2) // max 2 rings
    const statuses = char.statuses
    const maxStatusDots = 3

    return (
      <div
        key={char.id}
        style={{
          position: 'relative',
          cursor: 'pointer',
          transition: 'transform 0.15s ease',
        }}
        onClick={() => {
          onInspectCharacter(inspectedCharacterId === char.id ? null : char.id)
        }}
        onContextMenu={(e) => handleContextMenu(e, char.id)}
        onMouseEnter={(e) => {
          if (!isMine) (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'
        }}
        onMouseLeave={(e) => {
          if (!isMine) (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
        }}
        title={`${char.name}${statuses.length > 0 ? '\n' + statuses.map(s => s.label).join(', ') : ''}`}
      >
        {/* SVG ring progress */}
        <svg
          width={PORTRAIT_SIZE}
          height={PORTRAIT_SIZE}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          {displayResources.map((_, i) => (
            <ResourceRingBg key={`bg-${i}`} index={i} size={PORTRAIT_SIZE} />
          ))}
          {displayResources.map((res, i) => {
            const pct = res.max > 0 ? res.current / res.max : 0
            return (
              <ResourceRing key={i} index={i} pct={pct} color={res.color} size={PORTRAIT_SIZE} />
            )
          })}
        </svg>

        {/* Portrait image */}
        <div style={{
          width: PORTRAIT_SIZE,
          height: PORTRAIT_SIZE,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {char.imageUrl ? (
            <img
              src={char.imageUrl}
              alt={char.name}
              style={{
                width: IMG_SIZE,
                height: IMG_SIZE,
                borderRadius: '50%',
                objectFit: 'cover',
                border: isInspected
                  ? '2px solid #fff'
                  : isActive
                    ? `2px solid ${char.color}`
                    : '2px solid rgba(255,255,255,0.15)',
                boxShadow: isInspected ? `0 0 12px ${char.color}88` : 'none',
                display: 'block',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            />
          ) : (
            <div
              style={{
                width: IMG_SIZE,
                height: IMG_SIZE,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${char.color}, ${char.color}aa)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'sans-serif',
                border: isInspected
                  ? '2px solid #fff'
                  : '2px solid rgba(255,255,255,0.15)',
                boxShadow: isInspected ? `0 0 12px ${char.color}88` : 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            >
              {char.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Online indicator (PC only) */}
        {char.type === 'pc' && isOnline && (
          <div
            style={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#22c55e',
              border: '2px solid rgba(15, 15, 25, 0.85)',
              boxShadow: '0 0 6px rgba(34,197,94,0.5)',
            }}
          />
        )}

        {/* Status dots (top-right) */}
        {statuses.length > 0 && (
          <div style={{
            position: 'absolute',
            top: -1,
            right: -2,
            display: 'flex',
            gap: 2,
          }}>
            {statuses.slice(0, maxStatusDots).map((s, i) => {
              const sc = statusColor(s.label)
              return (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: sc,
                    border: '1px solid rgba(15, 15, 25, 0.85)',
                    boxShadow: `0 0 4px ${sc}66`,
                  }}
                />
              )
            })}
            {statuses.length > maxStatusDots && (
              <div style={{
                fontSize: 7,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.6)',
                fontFamily: 'sans-serif',
                lineHeight: '7px',
              }}>
                +{statuses.length - maxStatusDots}
              </div>
            )}
          </div>
        )}

        {/* NPC indicator (small diamond) */}
        {char.type === 'npc' && (
          <div style={{
            position: 'absolute',
            bottom: 1,
            left: 1,
            width: 8,
            height: 8,
            background: '#fbbf24',
            transform: 'rotate(45deg)',
            border: '1px solid rgba(15, 15, 25, 0.85)',
            borderRadius: 1,
          }} />
        )}
      </div>
    )
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '3px 10px',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: 'sans-serif',
    color: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
    background: 'none',
    border: 'none',
    borderBottom: isActive ? '2px solid #60a5fa' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  })

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tab buttons */}
      <div style={{
        display: 'flex',
        gap: 2,
        pointerEvents: 'auto',
      }}>
        <button onClick={() => setActiveTab('characters')} style={tabStyle(activeTab === 'characters')}>
          Characters
        </button>
        <button onClick={() => setActiveTab('initiative')} style={tabStyle(activeTab === 'initiative')}>
          Initiative
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'characters' && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            background: 'rgba(15, 15, 25, 0.75)',
            backdropFilter: 'blur(16px)',
            borderRadius: 28,
            padding: '5px 10px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.08)',
            pointerEvents: 'auto',
          }}
        >
          {pcChars.map(renderPortrait)}

          {/* Separator between PCs and NPCs */}
          {hasSection && (
            <div style={{
              width: 1,
              height: 32,
              background: 'rgba(255,255,255,0.12)',
              margin: '0 2px',
            }} />
          )}

          {npcChars.map(renderPortrait)}
        </div>
      )}

      {activeTab === 'initiative' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 20px',
          background: 'rgba(15, 15, 25, 0.75)',
          backdropFilter: 'blur(16px)',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          fontSize: 12,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'sans-serif',
          pointerEvents: 'auto',
        }}>
          Coming soon
        </div>
      )}

      {/* Context menu — rendered via portal to avoid transform offset */}
      {contextMenu && (() => {
        const char = characters.find(c => c.id === contextMenu.charId)
        if (!char) return null
        return createPortal(
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={getContextMenuItems(char)}
            onClose={() => setContextMenu(null)}
          />,
          document.body,
        )
      })()}
    </div>
  )
}
