import type { MouseEvent } from 'react'
import type { CombatInfo } from '../stores/worldStore'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useUiStore } from '../stores/uiStore'
import { KonvaMap } from './KonvaMap'

interface TacticalPanelProps {
  combatInfo: CombatInfo | null
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
  visible: boolean
}

export function TacticalPanel({
  combatInfo,
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
  visible,
}: TacticalPanelProps) {
  const gmViewAsPlayer = useUiStore((s) => s.gmViewAsPlayer)

  return (
    <div
      className={`fixed inset-0 z-combat motion-reduce:duration-0 ${
        visible
          ? 'opacity-100 transition-opacity duration-slow ease-out pointer-events-auto'
          : 'opacity-0 transition-opacity duration-normal ease-in pointer-events-none'
      }`}
      onContextMenu={visible ? onContextMenu : undefined}
    >
      {/* Screen-space vignette overlay — edge darkening for immersive map/background blending */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)',
        }}
      />
      <KonvaMap
        combatInfo={combatInfo}
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
