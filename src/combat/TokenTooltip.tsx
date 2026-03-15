import type { MapToken, Entity } from '../shared/entityTypes'
import { getEntityResources, getEntityStatuses } from '../shared/entityAdapters'
import { statusColor } from '../shared/tokenUtils'

interface TokenTooltipProps {
  token: MapToken
  entity: Entity | null
  screenX: number
  screenY: number
}

export function TokenTooltip({ entity, screenX, screenY }: TokenTooltipProps) {
  const name = entity?.name ?? ''
  const resources = getEntityResources(entity)
  const mainResource = resources[0]
  const hasHp = mainResource !== undefined && mainResource.max > 0
  const hpPct = hasHp ? Math.min(mainResource.current / mainResource.max, 1) : 0

  const statuses = getEntityStatuses(entity)
  const visibleStatuses = statuses.slice(0, 3)
  const extraCount = statuses.length - 3

  // Nothing to show
  if (!name && !hasHp && statuses.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: screenX,
        top: screenY + 8,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 10002,
        animation: 'fade-in 150ms ease-out',
      }}
      className="bg-glass backdrop-blur-[12px] rounded-md border border-border-glass shadow-[0_4px_16px_rgba(0,0,0,0.5)] px-2.5 py-1.5"
    >
      {/* Name */}
      {name && (
        <div
          className="text-text-primary font-bold text-center"
          style={{ fontSize: 11, lineHeight: '14px', whiteSpace: 'nowrap' }}
        >
          {name}
        </div>
      )}

      {/* HP bar */}
      {hasHp && (
        <div
          style={{
            width: 48,
            height: 5,
            borderRadius: 3,
            background: 'rgba(0,0,0,0.5)',
            marginTop: 3,
            marginLeft: 'auto',
            marginRight: 'auto',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${hpPct * 100}%`,
              height: '100%',
              borderRadius: 3,
              background: hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      )}

      {/* Status chips */}
      {visibleStatuses.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 2,
            marginTop: 3,
            justifyContent: 'center',
            flexWrap: 'nowrap',
          }}
        >
          {visibleStatuses.map((s, i) => (
            <span
              key={i}
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: '#fff',
                background: `${statusColor(s.label)}cc`,
                borderRadius: 4,
                padding: '1px 4px',
                whiteSpace: 'nowrap',
                maxWidth: 40,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {s.label}
            </span>
          ))}
          {extraCount > 0 && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 4,
                padding: '1px 4px',
                whiteSpace: 'nowrap',
              }}
            >
              +{extraCount}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
