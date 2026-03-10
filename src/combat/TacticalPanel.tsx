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
      <div
        className="border-b border-border-glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          flexShrink: 0,
        }}
      >
        <span className="text-text-primary" style={{ fontSize: 14, fontWeight: 500 }}>
          Tactical Map
        </span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '4px 8px',
          }}
        >
          &times;
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
