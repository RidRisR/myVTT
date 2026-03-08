import type { Character } from '../shared/characterTypes'
import { statusColor } from '../shared/tokenUtils'

interface CharacterDetailPanelProps {
  character: Character
  isOnline: boolean
  onClose: () => void
}

export function CharacterDetailPanel({ character, isOnline, onClose }: CharacterDetailPanelProps) {
  const resources = character.resources
  const attributes = character.attributes
  const statuses = character.statuses
  const notes = character.notes
  const handouts = character.handouts ?? []

  const hasContent = resources.length > 0 || attributes.length > 0 || statuses.length > 0 || notes || handouts.length > 0

  return (
    <div
      style={{
        width: 260,
        background: 'rgba(15, 15, 25, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 16px',
        fontFamily: 'sans-serif',
        maxHeight: 'inherit',
        boxSizing: 'border-box' as const,
        overflowY: 'auto' as const,
        color: '#e4e4e7',
        animation: 'panelFadeIn 0.2s ease-out',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes panelFadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 10, right: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.35)', padding: 4,
          display: 'flex', borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Portrait */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
        {character.imageUrl ? (
          <img
            src={character.imageUrl}
            alt={character.name}
            style={{
              width: 80, height: 80, borderRadius: '50%',
              objectFit: 'cover',
              border: `3px solid ${character.color}`,
              boxShadow: `0 0 20px ${character.color}33`,
              display: 'block',
            }}
          />
        ) : (
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: `linear-gradient(135deg, ${character.color}, ${character.color}99)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 32, fontWeight: 700,
            boxShadow: `0 0 20px ${character.color}33`,
          }}>
            {character.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name + Role + Online */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          fontWeight: 700, fontSize: 18, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, letterSpacing: 0.3,
        }}>
          {character.name}
          {isOnline && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#4ade80', fontWeight: 500, letterSpacing: 0,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 6px rgba(34,197,94,0.6)',
              }} />
              Online
            </span>
          )}
        </div>
        <span style={{
          display: 'inline-block', marginTop: 6,
          fontSize: 10, padding: '3px 10px', borderRadius: 10,
          background: character.type === 'pc' ? 'rgba(96,165,250,0.2)' : 'rgba(251,191,36,0.2)',
          color: character.type === 'pc' ? '#60a5fa' : '#fbbf24',
          fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase',
        }}>
          {character.type === 'pc' ? 'Player' : 'NPC'}
        </span>
      </div>

      {hasContent && (
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 -16px 16px' }} />
      )}

      {/* Resources (read-only bars) */}
      {resources.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontWeight: 600, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>Resources</div>
          {resources.map((res, i) => {
            const pct = res.max > 0 ? Math.min(res.current / res.max, 1) : 0
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, marginBottom: 2,
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{res.key || 'Unnamed'}</span>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 10 }}>{res.current}/{res.max}</span>
                </div>
                <div style={{
                  height: 10, borderRadius: 5,
                  background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct * 100}%`,
                    background: `linear-gradient(90deg, ${res.color}, ${res.color}cc)`,
                    borderRadius: 5,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Attributes (read-only values) */}
      {attributes.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontWeight: 600, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>Attributes</div>
          {attributes.map((attr, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 8px', borderRadius: 6,
              background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
              fontSize: 12,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{attr.key || 'Unnamed'}</span>
              <span style={{ color: '#fff', fontWeight: 700 }}>{attr.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Statuses (read-only chips) */}
      {statuses.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontWeight: 600, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>Statuses</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {statuses.map((s, i) => {
              const sc = statusColor(s.label)
              return (
                <span key={i} style={{
                  padding: '3px 10px', borderRadius: 12,
                  background: `${sc}22`, color: sc,
                  fontSize: 11, fontWeight: 600,
                  border: `1px solid ${sc}33`,
                }}>
                  {s.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Notes (read-only text) */}
      {notes && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontWeight: 600, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>Notes</div>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.5,
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.03)',
            whiteSpace: 'pre-wrap',
          }}>
            {notes}
          </div>
        </div>
      )}

      {/* Handouts (read-only cards) */}
      {handouts.length > 0 && (
        <div>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontWeight: 600, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: 1,
          }}>Handouts</div>
          {handouts.map((h) => (
            <div key={h.id} style={{
              marginBottom: 6,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {h.imageUrl && (
                  <img src={h.imageUrl} alt="" style={{
                    width: 32, height: 32, borderRadius: 4,
                    objectFit: 'cover', flexShrink: 0,
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: '#e4e4e7',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {h.title || 'Untitled'}
                  </div>
                  {h.description && (
                    <div style={{
                      fontSize: 11, color: 'rgba(255,255,255,0.45)',
                      marginTop: 2, lineHeight: 1.3,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {h.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
