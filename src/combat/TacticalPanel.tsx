import { useState, useCallback } from 'react'
import type { Scene } from '../stores/worldStore'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useUiStore } from '../stores/uiStore'
import { KonvaMap } from './KonvaMap'
import { TacticalToolbar } from './TacticalToolbar'
import { GridConfigPanel } from './tools/GridConfigPanel'

interface TacticalPanelProps {
  scene: Scene | null
  tokens: MapToken[]
  getEntity: (id: string) => Entity | null
  mySeatId: string
  role: 'GM' | 'PL'
  selectedTokenId: string | null
  onSelectToken: (id: string | null) => void
  onUpdateToken: (id: string, updates: Partial<MapToken>) => void
  onDeleteToken: (id: string) => void
  onAddToken: (token: MapToken) => void
  onDropEntityOnMap?: (entityId: string, mapX: number, mapY: number) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onClose: () => void
  onAdvanceInitiative: () => void
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void
}

export function TacticalPanel({
  scene,
  tokens,
  getEntity,
  mySeatId,
  role,
  selectedTokenId,
  onSelectToken,
  onUpdateToken,
  onDeleteToken,
  onAddToken,
  onDropEntityOnMap,
  onContextMenu,
  onClose,
  onAdvanceInitiative,
  onUpdateScene,
}: TacticalPanelProps) {
  const gmViewAsPlayer = useUiStore((s) => s.gmViewAsPlayer)
  const [showGridConfig, setShowGridConfig] = useState(false)

  const handleToggleGrid = useCallback(() => {
    if (!scene) return
    const newVisible = !scene.gridVisible
    onUpdateScene(scene.id, {
      gridVisible: newVisible,
      gridSnap: newVisible,
    })
  }, [scene, onUpdateScene])

  const handleToggleGridConfig = useCallback(() => {
    setShowGridConfig((prev) => !prev)
  }, [])

  return (
    <div
      className="bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      style={{
        position: 'fixed',
        top: '15vh',
        left: '15vw',
        width: '70vw',
        height: '70vh',
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onContextMenu={onContextMenu}
    >
      {/* Header bar */}
      <div className="border-b border-border-glass flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-text-primary text-sm font-medium">Tactical Map</span>
      </div>

      {/* Panel body: toolbar + map side by side */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', position: 'relative' }}>
        {/* Left toolbar */}
        <TacticalToolbar
          gridVisible={scene?.gridVisible ?? false}
          gridSnap={scene?.gridSnap ?? false}
          showGridConfig={showGridConfig}
          onToggleGridConfig={handleToggleGridConfig}
          onToggleGrid={handleToggleGrid}
          onAdvanceInitiative={onAdvanceInitiative}
          onClose={onClose}
          role={role}
        />

        {/* Map area */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <KonvaMap
            scene={scene}
            tokens={tokens}
            getEntity={getEntity}
            mySeatId={mySeatId}
            role={role}
            selectedTokenId={selectedTokenId}
            onSelectToken={onSelectToken}
            onUpdateToken={onUpdateToken}
            onDeleteToken={onDeleteToken}
            onAddToken={onAddToken}
            onDropEntityOnMap={onDropEntityOnMap}
            gmViewAsPlayer={gmViewAsPlayer}
          />
        </div>

        {/* Grid config pop-out */}
        {showGridConfig && scene && (
          <GridConfigPanel
            scene={scene}
            onUpdateScene={onUpdateScene}
            onClose={() => setShowGridConfig(false)}
          />
        )}
      </div>
    </div>
  )
}
