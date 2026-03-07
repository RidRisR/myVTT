import type { Seat } from '../identity/useIdentity'

interface PortraitBarProps {
  seats: Seat[]
  mySeatId: string
  onlineSeatIds: Set<string>
  inspectedSeatId: string | null
  onInspectSeat: (seatId: string | null) => void
}

export function PortraitBar({
  seats,
  mySeatId,
  onlineSeatIds,
  inspectedSeatId,
  onInspectSeat,
}: PortraitBarProps) {
  if (seats.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          background: 'rgba(15, 15, 25, 0.75)',
          backdropFilter: 'blur(16px)',
          borderRadius: 28,
          padding: '5px 10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.08)',
          pointerEvents: 'auto',
        }}
      >
        {seats.map((seat) => {
          const isMe = seat.id === mySeatId
          const isOnline = isMe || onlineSeatIds.has(seat.id)
          const isInspected = inspectedSeatId === seat.id

          return (
            <div
              key={seat.id}
              style={{
                position: 'relative',
                cursor: isMe ? 'default' : 'pointer',
                transition: 'transform 0.15s ease',
              }}
              onClick={() => {
                if (!isMe) {
                  onInspectSeat(inspectedSeatId === seat.id ? null : seat.id)
                }
              }}
              onMouseEnter={(e) => {
                if (!isMe) (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'
              }}
              onMouseLeave={(e) => {
                if (!isMe) (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
              }}
              title={seat.name}
            >
              {seat.portraitUrl ? (
                <img
                  src={seat.portraitUrl}
                  alt={seat.name}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: isInspected
                      ? `2px solid #fff`
                      : isMe
                        ? `2px solid ${seat.color}`
                        : '2px solid rgba(255,255,255,0.15)',
                    boxShadow: isInspected ? `0 0 12px ${seat.color}88` : 'none',
                    display: 'block',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${seat.color}, ${seat.color}aa)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: 'sans-serif',
                    border: isInspected
                      ? '2px solid #fff'
                      : '2px solid rgba(255,255,255,0.15)',
                    boxShadow: isInspected ? `0 0 12px ${seat.color}88` : 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                >
                  {seat.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Online indicator */}
              {isOnline && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '2px solid rgba(15, 15, 25, 0.85)',
                    boxShadow: '0 0 6px rgba(34,197,94,0.5)',
                  }}
                />
              )}

              {/* Name tooltip on hover — handled by title attr */}
            </div>
          )
        })}
      </div>
    </div>
  )
}
