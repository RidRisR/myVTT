import type { ComponentProps } from '../../src/ui-system/types'

export function SessionInfoPanel({ sdk }: ComponentProps) {
  const entities = sdk.read.query({})
  const characters = entities.filter(
    (e) => e.lifecycle === 'persistent' && e.components['core:identity'],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#e2e8f0',
        fontSize: 12,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Title bar — draggable in play mode */}
      {sdk.context.layoutMode === 'play' && (
        <div
          onMouseDown={(e) => sdk.interaction?.layout.startDrag(e)}
          style={{
            padding: '5px 10px',
            background: 'rgba(59,130,246,0.15)',
            borderBottom: '1px solid rgba(59,130,246,0.2)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'move',
            userSelect: 'none',
            letterSpacing: '0.02em',
          }}
        >
          Session
        </div>
      )}

      <div
        style={{
          padding: '10px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        {/* Role badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.05em',
              background:
                sdk.context.role === 'GM' ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.15)',
              color: sdk.context.role === 'GM' ? '#fbbf24' : '#60a5fa',
            }}
          >
            {sdk.context.role}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
            {sdk.context.layoutMode === 'edit' ? 'editing layout' : ''}
          </span>
        </div>

        {/* Character list */}
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
            Characters ({characters.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {characters.slice(0, 6).map((entity) => {
              const identity = entity.components['core:identity'] as
                | { name: string; color?: string }
                | undefined
              if (!identity) return null
              return (
                <div
                  key={entity.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 6px',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: identity.color ?? '#6b7280',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                    }}
                  >
                    {identity.name}
                  </span>
                </div>
              )
            })}
            {characters.length === 0 && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                No characters yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
