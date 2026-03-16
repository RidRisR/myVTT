import { forwardRef } from 'react'
import type { MouseEvent } from 'react'
import type { TacticalInfo } from '../stores/worldStore'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useUiStore } from '../stores/uiStore'
import { KonvaMap } from './KonvaMap'
import type { KonvaMapHandle } from './KonvaMap'

export type { KonvaMapHandle }

interface TacticalPanelProps {
  tacticalInfo: TacticalInfo | null
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

export const TacticalPanel = forwardRef<KonvaMapHandle, TacticalPanelProps>(function TacticalPanel(
  {
    tacticalInfo,
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
  },
  ref,
) {
  const gmViewAsPlayer = useUiStore((s) => s.gmViewAsPlayer)

  return (
    <div
      data-testid="tactical-canvas"
      className={`fixed inset-0 z-tactical motion-reduce:duration-0 ${
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
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
        }}
      />
      <KonvaMap
        ref={ref}
        tacticalInfo={tacticalInfo}
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
})
