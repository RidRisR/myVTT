import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../yjs/useScenes'
import type { CombatToken, TokenBlueprint } from '../combat/combatTypes'
import type { Character } from '../shared/characterTypes'
import { generateTokenId } from '../combat/combatUtils'
import { nextNpcName } from '../shared/characterUtils'
import { MapDockTab } from './MapDockTab'
import { TokenDockTab } from './TokenDockTab'

type TabId = 'maps' | 'tokens'

interface BottomDockProps {
  scenes: Scene[]
  combatSceneId: string | null
  onSetCombatScene: (sceneId: string) => void
  onAddScene: (scene: Scene) => void
  onDeleteScene: (id: string) => void

  blueprints: TokenBlueprint[]
  onAddBlueprint: (bp: TokenBlueprint) => void
  onUpdateBlueprint: (id: string, updates: Partial<TokenBlueprint>) => void
  onDeleteBlueprint: (id: string) => void

  characters: Character[]
  onAddCharacter: (char: Character) => void
  isCombat: boolean

  selectedToken: CombatToken | null
  onAddToken: (token: CombatToken) => void
  onDeleteToken: (id: string) => void
  onUpdateToken: (id: string, updates: Partial<CombatToken>) => void
  onSelectToken: (id: string | null) => void
}

export function BottomDock({
  scenes,
  combatSceneId,
  onSetCombatScene,
  onAddScene,
  onDeleteScene,
  blueprints,
  onAddBlueprint,
  onUpdateBlueprint,
  onDeleteBlueprint,
  characters,
  onAddCharacter,
  isCombat,
  selectedToken,
  onAddToken,
  onDeleteToken,
  onUpdateToken,
  onSelectToken,
}: BottomDockProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)

  // Click outside to collapse
  useEffect(() => {
    if (activeTab === null) return
    const handleClickOutside = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setActiveTab(null)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [activeTab])

  const toggleTab = (tab: TabId) => {
    setActiveTab(prev => prev === tab ? null : tab)
  }

  // Create a new independent Character from a blueprint (unlinked — never deduplicates)
  const createCharFromBlueprint = (bp: TokenBlueprint, featured: boolean): Character => {
    const name = nextNpcName(bp.name, characters, bp.id)
    const char: Character = {
      id: generateTokenId(),
      name,
      imageUrl: bp.imageUrl,
      color: bp.defaultColor,
      type: 'npc',
      blueprintId: bp.id,
      size: bp.defaultSize,
      resources: [],
      attributes: [],
      statuses: [],
      notes: '',
      featured,
    }
    onAddCharacter(char)
    return char
  }

  const handleSpawnFromBlueprint = (bp: TokenBlueprint) => {
    const char = createCharFromBlueprint(bp, false)
    const token: CombatToken = {
      id: generateTokenId(),
      characterId: char.id,
      x: 200,
      y: 200,
      size: bp.defaultSize,
      gmOnly: false,
    }
    onAddToken(token)
    onSelectToken(token.id)
  }

  const handleAddToActive = (bp: TokenBlueprint) => {
    createCharFromBlueprint(bp, true)
  }

  const handleDeleteSelected = () => {
    if (!selectedToken) return
    onDeleteToken(selectedToken.id)
    onSelectToken(null)
  }

  const handleToggleGmOnly = () => {
    if (!selectedToken) return
    onUpdateToken(selectedToken.id, { gmOnly: !selectedToken.gmOnly })
  }

  const tabBtnStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    background: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(30,30,50,0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderBottom: isActive ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: isActive ? '#fff' : '#b0b0b0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
    fontFamily: 'sans-serif',
    transition: 'all 0.15s',
  })

  const actionBtnStyle: React.CSSProperties = {
    padding: '7px 12px',
    background: 'rgba(30,30,50,0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
    fontFamily: 'sans-serif',
  }

  return (
    <div
      ref={dockRef}
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Expanded content area */}
      {activeTab !== null && (
        <div style={{
          marginBottom: 6,
          background: 'rgba(15, 15, 25, 0.92)',
          backdropFilter: 'blur(16px)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          minWidth: 400,
          maxHeight: 220,
          overflowY: 'auto',
          padding: 12,
        }}>
          {activeTab === 'maps' && (
            <MapDockTab
              scenes={scenes}
              combatSceneId={combatSceneId}
              onSetCombatScene={onSetCombatScene}
              onAddScene={onAddScene}
              onDeleteScene={onDeleteScene}
            />
          )}
          {activeTab === 'tokens' && (
            <TokenDockTab
              blueprints={blueprints}
              onAddBlueprint={onAddBlueprint}
              onUpdateBlueprint={onUpdateBlueprint}
              onDeleteBlueprint={onDeleteBlueprint}
              onSpawnToken={handleSpawnFromBlueprint}
              onAddToActive={handleAddToActive}
              isCombat={isCombat}
            />
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Maps tab */}
        <button onClick={() => toggleTab('maps')} style={tabBtnStyle(activeTab === 'maps')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          Maps
        </button>

        {/* Tokens tab */}
        <button onClick={() => toggleTab('tokens')} style={tabBtnStyle(activeTab === 'tokens')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </svg>
          Tokens
        </button>

        {/* Action: Delete selected token */}
        {selectedToken && (
          <button onClick={handleDeleteSelected} style={{ ...actionBtnStyle, color: '#f87171' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1.5 14a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2L5 6" />
            </svg>
            Delete
          </button>
        )}

        {/* Action: Toggle visibility */}
        {selectedToken && (
          <button onClick={handleToggleGmOnly} style={{
            ...actionBtnStyle,
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
    </div>
  )
}
