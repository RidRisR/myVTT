import { KeepScale } from 'react-zoom-pan-pinch'
import type { Entity } from '../shared/entityTypes'
import { getEntityResources, getEntityStatuses } from '../shared/entityAdapters'
import { statusColor } from '../shared/tokenUtils'

interface TokenOverlayProps {
  entity: Entity | null
  name: string
}

export function TokenOverlay({ entity, name }: TokenOverlayProps) {
  const resources = getEntityResources(entity)
  const mainResource = resources[0]
  const hasHp = mainResource && mainResource.max > 0
  const hpPct = hasHp ? Math.min(mainResource.current / mainResource.max, 1) : 0

  const statuses = getEntityStatuses(entity)

  return (
    <KeepScale>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Name label */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif',
            lineHeight: 1.2,
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>

        {/* HP bar */}
        {hasHp && (
          <div
            style={{
              width: 48,
              height: 5,
              borderRadius: 3,
              background: 'rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${hpPct * 100}%`,
                background: hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444',
                borderRadius: 3,
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        )}

        {/* Status chips */}
        {statuses.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: 120,
            }}
          >
            {statuses.slice(0, 3).map((s, i) => {
              const sc = statusColor(s.label)
              return (
                <span
                  key={i}
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    padding: '1px 4px',
                    borderRadius: 4,
                    background: `${sc}cc`,
                    color: '#fff',
                    fontFamily: 'sans-serif',
                    lineHeight: 1.3,
                  }}
                >
                  {s.label}
                </span>
              )
            })}
            {statuses.length > 3 && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  padding: '1px 4px',
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  fontFamily: 'sans-serif',
                  lineHeight: 1.3,
                }}
              >
                +{statuses.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </KeepScale>
  )
}
