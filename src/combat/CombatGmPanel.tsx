import { useRef, useState } from 'react'
import type { CombatToken } from './combatTypes'
import type { Scene } from '../yjs/useScenes'
import { uploadAsset } from '../shared/assetUpload'
import { generateTokenId } from './combatUtils'

interface CombatGmPanelProps {
  selectedToken: CombatToken | null
  scenes: Scene[]
  combatSceneId: string | null
  onAddToken: (token: CombatToken) => void
  onDeleteToken: (id: string) => void
  onUpdateToken: (id: string, updates: Partial<CombatToken>) => void
  onSelectToken: (id: string | null) => void
  onSetCombatScene: (sceneId: string) => void
  onAddScene: (scene: Scene) => void
}

export function CombatGmPanel({
  selectedToken,
  scenes,
  combatSceneId,
  onAddToken,
  onDeleteToken,
  onUpdateToken,
  onSelectToken,
  onSetCombatScene,
  onAddScene,
}: CombatGmPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const mapFileRef = useRef<HTMLInputElement>(null)
  const [showMapPicker, setShowMapPicker] = useState(false)

  const handleSpawn = () => {
    fileRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const imageUrl = await uploadAsset(file)
    const name = file.name.replace(/\.[^.]+$/, '')
    const token: CombatToken = {
      id: generateTokenId(),
      name,
      imageUrl,
      x: 200,
      y: 200,
      size: 1,
      ownerId: null,
      gmOnly: false,
      color: '#3b82f6',
      resources: [],
      attributes: [],
      statuses: [],
      notes: '',
    }
    onAddToken(token)
    onSelectToken(token.id)
  }

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const imageUrl = await uploadAsset(file)
    const name = file.name.replace(/\.[^.]+$/, '')

    // Get image dimensions
    const img = new Image()
    img.src = imageUrl
    await new Promise<void>((resolve) => { img.onload = () => resolve() })

    const scene: Scene = {
      id: generateTokenId(),
      name,
      imageUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      gridSize: 50,
      gridVisible: true,
      gridColor: '#ffffff',
      gridOffsetX: 0,
      gridOffsetY: 0,
      sortOrder: scenes.length,
    }
    onAddScene(scene)
    onSetCombatScene(scene.id)
    setShowMapPicker(false)
  }

  const handleDelete = () => {
    if (!selectedToken) return
    onDeleteToken(selectedToken.id)
    onSelectToken(null)
  }

  const handleToggleGmOnly = () => {
    if (!selectedToken) return
    onUpdateToken(selectedToken.id, { gmOnly: !selectedToken.gmOnly })
  }

  const btnStyle: React.CSSProperties = {
    padding: '7px 12px',
    background: 'rgba(30,30,50,0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: '#e0e0e0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 52,
        left: 16,
        zIndex: 10000,
        display: 'flex',
        gap: 6,
        fontFamily: 'sans-serif',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={mapFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleMapUpload} />

      {/* Map picker */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowMapPicker(!showMapPicker)} style={btnStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          Map
        </button>

        {showMapPicker && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            background: 'rgba(20,20,35,0.96)',
            backdropFilter: 'blur(12px)',
            borderRadius: 10,
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: 200,
            maxHeight: 300,
            overflowY: 'auto',
            padding: 4,
          }}>
            {scenes.length === 0 && (
              <div style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center' }}>
                No scenes yet
              </div>
            )}
            {scenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => {
                  onSetCombatScene(scene.id)
                  setShowMapPicker(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  background: scene.id === combatSceneId ? 'rgba(59,130,246,0.15)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  textAlign: 'left',
                  color: '#e0e0e0',
                  fontFamily: 'sans-serif',
                }}
              >
                <img src={scene.imageUrl} alt=""
                  style={{ width: 36, height: 24, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                <span style={{
                  fontWeight: scene.id === combatSceneId ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {scene.name || 'Untitled'}
                </span>
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <button
              onClick={() => { mapFileRef.current?.click() }}
              style={{
                width: '100%', padding: '8px 12px',
                background: 'transparent', border: 'none', borderRadius: 6,
                cursor: 'pointer', fontSize: 12, color: '#60a5fa',
                fontWeight: 600, textAlign: 'left', fontFamily: 'sans-serif',
              }}
            >
              Upload new map...
            </button>
          </div>
        )}
      </div>

      {/* Spawn */}
      <button onClick={handleSpawn} style={btnStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Spawn
      </button>

      {/* Delete selected */}
      {selectedToken && (
        <button onClick={handleDelete} style={{ ...btnStyle, color: '#f87171' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1.5 14a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Delete
        </button>
      )}

      {/* Toggle GM-only */}
      {selectedToken && (
        <button onClick={handleToggleGmOnly} style={{
          ...btnStyle,
          color: selectedToken.gmOnly ? '#fbbf24' : '#a0a0a0',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {selectedToken.gmOnly ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
          {selectedToken.gmOnly ? 'Hidden' : 'Visible'}
        </button>
      )}
    </div>
  )
}
