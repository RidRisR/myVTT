import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { Scene } from '../yjs/useScenes'
import type { CombatToken } from './combatTypes'
import type { Character } from '../shared/characterTypes'
import { CombatMap } from './CombatMap'
import { TokenLayer } from './TokenLayer'

interface CombatViewerProps {
  scene: Scene | null
  tokens: CombatToken[]
  getCharacter: (id: string) => Character | null
  mySeatId: string
  role: 'GM' | 'PL'
  selectedTokenId: string | null
  onSelectToken: (id: string | null) => void
  onUpdateToken: (id: string, updates: Partial<CombatToken>) => void
}

export function CombatViewer({
  scene,
  tokens,
  getCharacter,
  mySeatId,
  role,
  selectedTokenId,
  onSelectToken,
  onUpdateToken,
}: CombatViewerProps) {
  if (!scene) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#1a1a2e', color: '#666',
        fontFamily: 'sans-serif', fontSize: 16,
      }}>
        No combat scene selected
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      overflow: 'hidden', background: '#111',
    }}>
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={5}
        centerOnInit
        limitToBounds={false}
        panning={{ excluded: ['combat-token'] }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: scene.width, height: scene.height }}
        >
          <CombatMap scene={scene}>
            <TokenLayer
              tokens={tokens}
              getCharacter={getCharacter}
              scene={scene}
              role={role}
              mySeatId={mySeatId}
              selectedTokenId={selectedTokenId}
              onSelectToken={onSelectToken}
              onUpdateToken={onUpdateToken}
            />
          </CombatMap>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
