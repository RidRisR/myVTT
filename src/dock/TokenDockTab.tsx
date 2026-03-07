import { useRef, useState } from 'react'
import type { TokenBlueprint } from '../combat/combatTypes'
import { uploadAsset } from '../shared/assetUpload'
import { generateTokenId } from '../combat/combatUtils'

interface TokenDockTabProps {
  blueprints: TokenBlueprint[]
  onAddBlueprint: (bp: TokenBlueprint) => void
  onUpdateBlueprint: (id: string, updates: Partial<TokenBlueprint>) => void
  onDeleteBlueprint: (id: string) => void
  onSpawnToken: (bp: TokenBlueprint) => void
}

export function TokenDockTab({
  blueprints,
  onAddBlueprint,
  onUpdateBlueprint,
  onDeleteBlueprint,
  onSpawnToken,
}: TokenDockTabProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const imageUrl = await uploadAsset(file)
      const bp: TokenBlueprint = {
        id: generateTokenId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        imageUrl,
        defaultSize: 1,
        defaultColor: '#3b82f6',
      }
      onAddBlueprint(bp)
    } finally {
      setUploading(false)
    }
  }

  const startEdit = (bp: TokenBlueprint) => {
    setEditingId(bp.id)
    setEditName(bp.name)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      onUpdateBlueprint(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
        gap: 10,
      }}>
        {blueprints.map((bp) => {
          const isHovered = hoveredId === bp.id
          return (
            <div
              key={bp.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                position: 'relative',
              }}
              onMouseEnter={() => setHoveredId(bp.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Circular token image */}
              <div
                onClick={() => onSpawnToken(bp)}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: `3px solid ${bp.defaultColor}`,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'box-shadow 0.15s',
                  boxShadow: isHovered ? `0 0 12px ${bp.defaultColor}44` : 'none',
                }}
              >
                <img
                  src={bp.imageUrl}
                  alt={bp.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                  draggable={false}
                />
              </div>

              {/* Name label (double-click to edit) */}
              {editingId === bp.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  autoFocus
                  style={{
                    width: 64,
                    fontSize: 9,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    color: '#fff',
                    outline: 'none',
                    padding: '2px 4px',
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(bp)}
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.6)',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 72,
                    cursor: 'default',
                  }}
                >
                  {bp.name}
                </span>
              )}

              {/* Delete button on hover */}
              {isHovered && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteBlueprint(bp.id) }}
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: 2,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#f87171',
                    fontSize: 11,
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

        {/* Upload card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: '2px dashed rgba(255,255,255,0.15)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.3)',
              fontSize: 22,
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
            {uploading ? '...' : '+'}
          </div>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
            Add Token
          </span>
        </div>
      </div>
    </div>
  )
}
