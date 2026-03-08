import { useState } from 'react'
import type { HandoutAsset } from './useHandoutAssets'

interface HandoutDockTabProps {
  assets: HandoutAsset[]
  onShowcase: (asset: HandoutAsset) => void
  onEdit: (asset: HandoutAsset) => void
  onDeleteAsset: (id: string) => void
  onRequestCreate: () => void
}

export function HandoutDockTab({
  assets,
  onShowcase,
  onEdit,
  onDeleteAsset,
  onRequestCreate,
}: HandoutDockTabProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
      gap: 8,
    }}>
      {assets.map((asset) => {
        const isHovered = hoveredId === asset.id
        const hasImage = !!asset.imageUrl
        return (
          <div
            key={asset.id}
            style={{
              position: 'relative',
              cursor: 'pointer',
              borderRadius: 8,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.08)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onClick={() => onShowcase(asset)}
            onMouseEnter={() => setHoveredId(asset.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {hasImage ? (
              <img
                src={asset.imageUrl}
                alt={asset.title}
                style={{
                  width: '100%',
                  height: 70,
                  objectFit: 'cover',
                  display: 'block',
                }}
                draggable={false}
              />
            ) : (
              <div style={{
                width: '100%',
                height: 70,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.04)',
                padding: 6,
              }}>
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.35)',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}>
                  {asset.content || 'Text'}
                </span>
              </div>
            )}
            <div style={{
              padding: '4px 6px',
              fontSize: 10,
              color: 'rgba(255,255,255,0.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'rgba(0,0,0,0.3)',
            }}>
              {asset.title || 'Untitled'}
            </div>

            {/* Edit button on hover */}
            {isHovered && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(asset) }}
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >✎</button>
            )}

            {/* Delete button on hover */}
            {isHovered && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteAsset(asset.id) }}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#f87171',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  padding: 0,
                }}
              >×</button>
            )}
          </div>
        )
      })}

      {/* Add card */}
      <div
        onClick={onRequestCreate}
        style={{
          height: 70 + 24,
          borderRadius: 8,
          border: '2px dashed rgba(255,255,255,0.15)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          color: 'rgba(255,255,255,0.3)',
          fontSize: 20,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
        }}
      >
        <span>+</span>
        <span style={{ fontSize: 10 }}>Add Handout</span>
      </div>
    </div>
  )
}
