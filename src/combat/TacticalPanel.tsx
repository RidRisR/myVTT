import { X } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import type { MapToken, Entity } from '../shared/entityTypes'
import { CombatViewer } from './CombatViewer'

interface TacticalPanelProps {
  scene: Scene | null
  tokens: MapToken[]
  getEntity: (id: string) => Entity | null
  mySeatId: string
  role: 'GM' | 'PL'
  selectedTokenId: string | null
  onSelectToken: (id: string | null) => void
  onUpdateToken: (id: string, updates: Partial<MapToken>) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onClose: () => void
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
  onContextMenu,
  onClose,
}: TacticalPanelProps) {
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
    >
      {/* Header bar */}
      <div className="border-b border-border-glass flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-text-primary text-sm font-medium">Tactical Map</span>
        <button
          onClick={onClose}
          className="bg-transparent border-none cursor-pointer text-text-muted p-1 flex transition-colors duration-fast hover:text-text-primary"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CombatViewer
          scene={scene}
          tokens={tokens}
          getEntity={getEntity}
          mySeatId={mySeatId}
          role={role}
          selectedTokenId={selectedTokenId}
          onSelectToken={onSelectToken}
          onUpdateToken={onUpdateToken}
          onContextMenu={onContextMenu}
        />
      </div>
    </div>
  )
}
