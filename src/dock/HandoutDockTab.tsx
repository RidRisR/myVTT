import { useRef, useState } from 'react'
import type { HandoutAsset } from './useHandoutAssets'
import { uploadAsset } from '../shared/assetUpload'
import { generateTokenId } from '../combat/combatUtils'

interface HandoutDockTabProps {
  assets: HandoutAsset[]
  onAddAsset: (asset: HandoutAsset) => void
  onDeleteAsset: (id: string) => void
  onEditAsset: (asset: HandoutAsset) => void
  onShowcase: (asset: HandoutAsset) => void
}

export function HandoutDockTab({
  assets,
  onAddAsset,
  onDeleteAsset,
  onEditAsset,
  onShowcase,
}: HandoutDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const imageUrl = await uploadAsset(file)
      onAddAsset({ id: generateTokenId(), imageUrl, createdAt: Date.now() })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: 8,
      }}>
        {assets.map((asset) => {
          const isHovered = hoveredId === asset.id
          return (
            <div
              key={asset.id}
              style={{
                position: 'relative',
                cursor: 'pointer',
                borderRadius: 8,
                overflow: 'hidden',
                border: '2px solid rgba(255,255,255,0.08)',
                transition: 'border-color 0.15s',
              }}
              onClick={() => onShowcase(asset)}
              onMouseEnter={() => setHoveredId(asset.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <img
                src={asset.imageUrl}
                alt=""
                style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block' }}
                draggable={false}
              />
              {/* Title indicator */}
              {asset.title && !isHovered && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '2px 6px',
                  background: 'rgba(0,0,0,0.6)',
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.8)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontFamily: 'sans-serif',
                }}>{asset.title}</div>
              )}
              {isHovered && (
                <>
                  {/* Edit button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditAsset(asset) }}
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
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                  {/* Delete button */}
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
                </>
              )}
            </div>
          )
        })}

        {/* Upload card */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            height: 70,
            borderRadius: 8,
            border: '2px dashed rgba(255,255,255,0.15)',
            cursor: 'pointer',
            display: 'flex',
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
          {uploading ? <span style={{ fontSize: 11 }}>...</span> : '+'}
        </div>
      </div>
    </div>
  )
}
