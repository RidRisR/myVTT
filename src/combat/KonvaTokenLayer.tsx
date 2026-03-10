import { useRef, useCallback } from 'react'
import { Layer } from 'react-konva'
import type Konva from 'konva'
import type { MapToken as MapTokenType, Entity } from '../shared/entityTypes'
import type { Scene } from '../stores/worldStore'
import { getEffectivePermissions, canSee } from '../shared/permissions'
import { canDragToken, snapToGrid } from './combatUtils'
import { KonvaToken } from './KonvaToken'

interface KonvaTokenLayerProps {
  tokens: MapTokenType[]
  getEntity: (id: string) => Entity | null
  scene: Scene
  role: 'GM' | 'PL'
  mySeatId: string
  selectedTokenId: string | null
  onSelectToken: (id: string | null) => void
  onUpdateToken: (id: string, updates: Partial<MapTokenType>) => void
  stageScale: number
}

const DRAG_THRESHOLD = 3

export function KonvaTokenLayer({
  tokens,
  getEntity,
  scene,
  role,
  mySeatId,
  selectedTokenId,
  onSelectToken,
  onUpdateToken,
  stageScale,
}: KonvaTokenLayerProps) {
  // Track whether a real drag happened (vs. click)
  const didDragRef = useRef(false)
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)

  // Filter tokens by visibility
  const visibleTokens = tokens.filter((t) => {
    const perms = getEffectivePermissions(t, getEntity)
    return canSee(perms, mySeatId, role)
  })

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target
      didDragRef.current = false
      dragStartPosRef.current = { x: node.x(), y: node.y() }
    },
    [],
  )

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      if (didDragRef.current) return
      const startPos = dragStartPosRef.current
      if (!startPos) return
      const node = e.target
      const dx = node.x() - startPos.x
      const dy = node.y() - startPos.y
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
        didDragRef.current = true
      }
    },
    [],
  )

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, tokenId: string) => {
      const node = e.target
      if (didDragRef.current) {
        let finalX = node.x()
        let finalY = node.y()
        if (scene.gridSnap) {
          const snapped = snapToGrid(
            finalX,
            finalY,
            scene.gridSize,
            scene.gridOffsetX,
            scene.gridOffsetY,
          )
          finalX = snapped.x
          finalY = snapped.y
          // Also snap the Konva node position so it visually settles
          node.x(finalX)
          node.y(finalY)
        }
        onUpdateToken(tokenId, { x: finalX, y: finalY })
      } else {
        // It was a click, not a drag — restore original position
        const startPos = dragStartPosRef.current
        if (startPos) {
          node.x(startPos.x)
          node.y(startPos.y)
        }
      }
      dragStartPosRef.current = null
    },
    [scene.gridSnap, scene.gridSize, scene.gridOffsetX, scene.gridOffsetY, onUpdateToken],
  )

  const handleSelect = useCallback(
    (tokenId: string) => {
      // If the drag just ended, don't toggle selection
      if (didDragRef.current) return
      onSelectToken(selectedTokenId === tokenId ? null : tokenId)
    },
    [selectedTokenId, onSelectToken],
  )

  return (
    <Layer>
      {visibleTokens.map((token) => {
        const entity = token.entityId ? getEntity(token.entityId) : null
        const isHidden =
          getEffectivePermissions(token, getEntity).default === 'none' && role === 'GM'
        const canDrag = canDragToken(role, entity, mySeatId)

        return (
          <KonvaToken
            key={token.id}
            token={token}
            entity={entity}
            pixelSize={token.size * scene.gridSize}
            selected={token.id === selectedTokenId}
            isHidden={isHidden}
            canDrag={canDrag}
            stageScale={stageScale}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        )
      })}
    </Layer>
  )
}
