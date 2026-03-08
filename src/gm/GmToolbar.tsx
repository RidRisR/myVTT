import { useState } from 'react'
import type { Scene } from '../yjs/useScenes'
import type { RoomState } from '../yjs/useRoom'
import { SceneLibrary } from './SceneLibrary'

interface GmToolbarProps {
  scenes: Scene[]
  room: RoomState
  onSelectScene: (sceneId: string) => void
  onEnterCombat: () => void
  onExitCombat: () => void
  onAddScene: (scene: Scene) => void
  onUpdateScene: (id: string, updates: Partial<Scene>) => void
  onDeleteScene: (id: string) => void
}

export function GmToolbar({
  scenes,
  room,
  onSelectScene,
  onEnterCombat,
  onExitCombat,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
}: GmToolbarProps) {
  const [showScenePicker, setShowScenePicker] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  const isCombat = room.mode === 'combat'

  return (
    <>
      {/* Toolbar */}
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          left: 16,
          zIndex: 10000,
          display: 'flex',
          gap: 6,
          fontFamily: 'sans-serif',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Scene picker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowScenePicker(!showScenePicker)}
            style={{
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            Scenes
          </button>

          {/* Scene dropdown */}
          {showScenePicker && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(8px)',
              borderRadius: 10,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
              minWidth: 200,
              maxHeight: 300,
              overflowY: 'auto',
              padding: 4,
            }}>
              {scenes.length === 0 && (
                <div style={{ padding: '12px 16px', color: '#999', fontSize: 12, textAlign: 'center' }}>
                  No scenes yet
                </div>
              )}
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => {
                    onSelectScene(scene.id)
                    setShowScenePicker(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    background: scene.id === room.activeSceneId ? 'rgba(59,130,246,0.1)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    textAlign: 'left',
                  }}
                >
                  <img
                    src={scene.imageUrl}
                    alt=""
                    style={{
                      width: 36,
                      height: 24,
                      objectFit: 'cover',
                      borderRadius: 3,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    fontWeight: scene.id === room.activeSceneId ? 600 : 400,
                    color: '#333',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {scene.name || 'Untitled'}
                  </span>
                </button>
              ))}
              <div style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
              <button
                onClick={() => {
                  setShowScenePicker(false)
                  setShowLibrary(true)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#2563eb',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                Manage Scenes...
              </button>
            </div>
          )}
        </div>

        {/* Combat toggle */}
        <button
          onClick={isCombat ? onExitCombat : onEnterCombat}
          style={{
            padding: '8px 14px',
            background: isCombat ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: isCombat ? '#fff' : '#333',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isCombat ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </>
            )}
          </svg>
          {isCombat ? 'Exit Combat' : 'Combat'}
        </button>

      </div>

      {/* Scene Library Modal */}
      {showLibrary && (
        <SceneLibrary
          scenes={scenes}
          onClose={() => setShowLibrary(false)}
          onAdd={onAddScene}
          onUpdate={onUpdateScene}
          onDelete={onDeleteScene}
          onSelect={(id) => { onSelectScene(id); setShowLibrary(false) }}
        />
      )}
    </>
  )
}
