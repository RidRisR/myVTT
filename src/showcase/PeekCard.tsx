import type { ShowcaseItem } from './showcaseTypes'

interface PeekCardProps {
  item: ShowcaseItem
  onClick: () => void
}

export function PeekCard({ item, onClick }: PeekCardProps) {
  if (item.type === 'text') {
    return (
      <div
        onClick={onClick}
        style={{
          cursor: 'pointer',
          padding: '8px 16px',
          maxWidth: 320,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontStyle: 'italic',
          fontSize: 13,
          color: 'rgba(255,255,255,0.7)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.text}
      </div>
    )
  }

  // image / handout
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 14px',
        background: 'rgba(15, 15, 25, 0.7)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          style={{
            width: 44,
            height: 44,
            objectFit: 'cover',
            borderRadius: 6,
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'sans-serif',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title || 'Untitled'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: item.senderColor,
              display: 'inline-block',
            }}
          />
          {item.senderName}
        </div>
      </div>
    </div>
  )
}
