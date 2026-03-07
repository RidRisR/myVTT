import type { Seat } from '../identity/useIdentity'

interface CharacterDetailPanelProps {
  seat: Seat
  isOnline: boolean
  onClose: () => void
}

export function CharacterDetailPanel({ seat, isOnline, onClose }: CharacterDetailPanelProps) {
  const properties = seat.properties ?? []

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        zIndex: 10000,
        width: 260,
        background: 'rgba(15, 15, 25, 0.88)',
        backdropFilter: 'blur(16px)',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 16px',
        fontFamily: 'sans-serif',
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto',
        color: '#e4e4e7',
        animation: 'panelFadeIn 0.2s ease-out',
      }}
      onPointerDown={(e) => e.stopPropagation()}
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
          top: 10,
          right: 10,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.35)',
          padding: 4,
          display: 'flex',
          borderRadius: 4,
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
        {seat.portraitUrl ? (
          <img
            src={seat.portraitUrl}
            alt={seat.name}
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              objectFit: 'cover',
              border: `3px solid ${seat.color}`,
              boxShadow: `0 0 20px ${seat.color}33`,
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${seat.color}, ${seat.color}99)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 32,
              fontWeight: 700,
              boxShadow: `0 0 20px ${seat.color}33`,
            }}
          >
            {seat.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name + Role + Online */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          fontWeight: 700,
          fontSize: 18,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          letterSpacing: 0.3,
        }}>
          {seat.name}
          {isOnline && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: '#4ade80',
              fontWeight: 500,
              letterSpacing: 0,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 6px rgba(34,197,94,0.6)',
              }} />
              Online
            </span>
          )}
        </div>
        <span
          style={{
            display: 'inline-block',
            marginTop: 6,
            fontSize: 10,
            padding: '3px 10px',
            borderRadius: 10,
            background: seat.role === 'GM' ? 'rgba(251,191,36,0.2)' : 'rgba(96,165,250,0.2)',
            color: seat.role === 'GM' ? '#fbbf24' : '#60a5fa',
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {seat.role === 'GM' ? 'Game Master' : 'Player'}
        </span>
      </div>

      {/* Properties (read-only) */}
      {properties.length > 0 && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 -16px 16px' }} />
          <div>
            <div style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              fontWeight: 600,
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              Properties
            </div>
            {properties.map((prop, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{prop.key}</span>
                <span style={{ color: '#fff', fontWeight: 500 }}>{prop.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
