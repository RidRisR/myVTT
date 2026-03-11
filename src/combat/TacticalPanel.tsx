import type { MouseEvent } from 'react'
import type { Scene } from '../stores/worldStore'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useUiStore } from '../stores/uiStore'
import { KonvaMap } from './KonvaMap'

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
  onContextMenu?: (e: MouseEvent) => void
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
}: TacticalPanelProps) {
  const gmViewAsPlayer = useUiStore((s) => s.gmViewAsPlayer)

  return (
    <div className="z-combat" style={{ position: 'fixed', inset: 0 }} onContextMenu={onContextMenu}>
      {/* Screen-space vignette overlay — edge darkening for immersive map/background blending */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)',
        }}
      />
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
  )
}
