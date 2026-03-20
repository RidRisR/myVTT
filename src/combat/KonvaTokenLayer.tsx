import { useRef, useCallback, useState } from 'react'
import { Layer } from 'react-konva'
import type Konva from 'konva'
import type { MapToken as MapTokenType, Entity } from '../shared/entityTypes'
import type { TacticalInfo } from '../stores/worldStore'
import { getEffectivePermissions, canSee } from '../shared/permissions'
import { canDragToken, snapToGrid } from './combatUtils'
import { KonvaToken } from './KonvaToken'
import { GhostToken } from './GhostToken'

export interface TokenContextMenuEvent {
  screenX: number
  screenY: number
  tokenId: string
  mapX: number
  mapY: number
}

export interface TokenHoverEvent {
  tokenId: string
  screenX: number
  screenY: number
}

interface KonvaTokenLayerProps {
  tokens: MapTokenType[]
  getEntity: (id: string) => Entity | null
  tacticalInfo: TacticalInfo
  role: 'GM' | 'PL'
  mySeatId: string
  selectedTokenIds: string[]
  primarySelectedTokenId: string | null
  onSelectToken: (id: string) => void
  onToggleSelection: (id: string) => void
  onUpdateToken: (id: string, updates: Partial<MapTokenType>) => void
  stageScale: number
  stagePos: { x: number; y: number }
  containerOffset: { x: number; y: number }
  onTokenContextMenu?: (event: TokenContextMenuEvent) => void
  onTokenHover?: (event: TokenHoverEvent | null) => void
  gmViewAsPlayer?: boolean
  onTokenDragMove?: (tokenId: string, x: number, y: number) => void
  onTokenDragEnd?: () => void
  remoteTokenDrags?: Map<string, { tokenId: string; x: number; y: number; color: string }>
  listening?: boolean
}

const DRAG_THRESHOLD = 3

export function KonvaTokenLayer({
  tokens,
  getEntity,
  tacticalInfo,
  role,
  mySeatId,
  selectedTokenIds,
  primarySelectedTokenId,
  onSelectToken,
  onToggleSelection,
  onUpdateToken,
  stageScale,
  stagePos,
  containerOffset,
  onTokenContextMenu,
  onTokenHover,
  gmViewAsPlayer = false,
  onTokenDragMove,
  onTokenDragEnd,
  remoteTokenDrags,
  listening = true,
}: KonvaTokenLayerProps) {
  // Track whether a real drag happened (vs. click)
  const didDragRef = useRef(false)
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ghost token state — snapped position during drag
  const [ghostState, setGhostState] = useState<{
    x: number
    y: number
    pixelSize: number
    color: string
  } | null>(null)

  // When GM is previewing as player, use 'PL' for visibility checks
  const effectiveRole = gmViewAsPlayer && role === 'GM' ? 'PL' : role

  // Filter tokens by visibility
  const visibleTokens = tokens.filter((t) => {
    const perms = getEffectivePermissions(t, getEntity)
    return canSee(perms, mySeatId, effectiveRole)
  })

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const draggingTokenIdRef = useRef<string | null>(null)

  const handleDragStart = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, tokenId: string) => {
      const node = e.target
      didDragRef.current = false
      isDraggingRef.current = true
      draggingTokenIdRef.current = tokenId
      dragStartPosRef.current = { x: node.x(), y: node.y() }
      // Clear tooltip on drag start
      clearHoverTimer()
      onTokenHover?.(null)
    },
    [clearHoverTimer, onTokenHover],
  )

  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const startPos = dragStartPosRef.current
      if (!startPos) return
      const node = e.target
      const dx = node.x() - startPos.x
      const dy = node.y() - startPos.y

      if (!didDragRef.current) {
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
          didDragRef.current = true
        } else {
          return
        }
      }

      // Broadcast position for real-time awareness
      if (draggingTokenIdRef.current) {
        onTokenDragMove?.(draggingTokenIdRef.current, node.x(), node.y())
      }

      // Show ghost token at snap position (only when gridSnap is enabled)
      if (tacticalInfo.grid.snap) {
        const snapped = snapToGrid(
          node.x(),
          node.y(),
          tacticalInfo.grid.size,
          tacticalInfo.grid.offsetX,
          tacticalInfo.grid.offsetY,
        )
        const draggedToken = draggingTokenIdRef.current
          ? tokens.find((t) => t.id === draggingTokenIdRef.current)
          : null
        const entity = draggedToken?.entityId ? getEntity(draggedToken.entityId) : null
        const tokenSize = draggedToken?.width ?? 1
        const tokenColor = entity?.color ?? '#888'

        setGhostState({
          x: snapped.x,
          y: snapped.y,
          pixelSize: tokenSize * tacticalInfo.grid.size,
          color: tokenColor,
        })
      }
    },
    [
      tacticalInfo.grid.snap,
      tacticalInfo.grid.size,
      tacticalInfo.grid.offsetX,
      tacticalInfo.grid.offsetY,
      tokens,
      getEntity,
      onTokenDragMove,
    ],
  )

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, tokenId: string) => {
      const node = e.target
      isDraggingRef.current = false
      draggingTokenIdRef.current = null
      setGhostState(null)

      if (didDragRef.current) {
        let finalX = node.x()
        let finalY = node.y()
        if (tacticalInfo.grid.snap) {
          const snapped = snapToGrid(
            finalX,
            finalY,
            tacticalInfo.grid.size,
            tacticalInfo.grid.offsetX,
            tacticalInfo.grid.offsetY,
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
      onTokenDragEnd?.()
    },
    [
      tacticalInfo.grid.snap,
      tacticalInfo.grid.size,
      tacticalInfo.grid.offsetX,
      tacticalInfo.grid.offsetY,
      onUpdateToken,
      onTokenDragEnd,
    ],
  )

  const handleSelect = useCallback(
    (tokenId: string, shiftKey: boolean) => {
      // If the drag just ended, don't toggle selection
      if (didDragRef.current) return
      if (shiftKey) {
        onToggleSelection(tokenId)
      } else {
        onSelectToken(tokenId)
      }
    },
    [onSelectToken, onToggleSelection],
  )

  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, tokenId: string) => {
      if (!onTokenContextMenu) return
      const token = tokens.find((t) => t.id === tokenId)
      if (!token) return

      const pixelSize = token.width * tacticalInfo.grid.size
      const screenX = (token.x + pixelSize / 2) * stageScale + stagePos.x + containerOffset.x
      const screenY = token.y * stageScale + stagePos.y + containerOffset.y

      onTokenContextMenu({
        screenX: e.evt.clientX,
        screenY: e.evt.clientY,
        tokenId,
        mapX: screenX,
        mapY: screenY,
      })
    },
    [onTokenContextMenu, tokens, tacticalInfo.grid.size, stageScale, stagePos, containerOffset],
  )

  const handleMouseEnter = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>, tokenId: string) => {
      if (isDraggingRef.current) return
      clearHoverTimer()

      hoverTimerRef.current = setTimeout(() => {
        if (isDraggingRef.current) return
        const token = tokens.find((t) => t.id === tokenId)
        if (!token) return

        const pixelSize = token.width * tacticalInfo.grid.size
        const screenX = (token.x + pixelSize / 2) * stageScale + stagePos.x + containerOffset.x
        const screenY = (token.y + pixelSize) * stageScale + stagePos.y + containerOffset.y

        onTokenHover?.({ tokenId, screenX, screenY })
      }, 300)
    },
    [
      tokens,
      tacticalInfo.grid.size,
      stageScale,
      stagePos,
      containerOffset,
      onTokenHover,
      clearHoverTimer,
    ],
  )

  const handleMouseLeave = useCallback(() => {
    clearHoverTimer()
    onTokenHover?.(null)
  }, [clearHoverTimer, onTokenHover])

  return (
    <Layer listening={listening}>
      {/* Ghost token preview (shown during drag with grid snap) */}
      {ghostState && (
        <GhostToken
          x={ghostState.x}
          y={ghostState.y}
          pixelSize={ghostState.pixelSize}
          color={ghostState.color}
        />
      )}

      {visibleTokens.map((token) => {
        const entity = token.entityId ? getEntity(token.entityId) : null
        const isHidden =
          getEffectivePermissions(token, getEntity).default === 'none' && role === 'GM'
        const canDrag = canDragToken(role, entity, mySeatId)

        // Apply remote drag position if another user is dragging this token
        const remoteDrag = remoteTokenDrags
          ? Array.from(remoteTokenDrags.values()).find((d) => d.tokenId === token.id)
          : undefined
        const displayToken = remoteDrag ? { ...token, x: remoteDrag.x, y: remoteDrag.y } : token

        const selectionState: 'primary' | 'secondary' | 'none' =
          token.id === primarySelectedTokenId
            ? 'primary'
            : selectedTokenIds.includes(token.id)
              ? 'secondary'
              : 'none'

        return (
          <KonvaToken
            key={token.id}
            token={displayToken}
            entity={entity}
            pixelSize={token.width * tacticalInfo.grid.size}
            selectionState={selectionState}
            isHidden={isHidden}
            canDrag={canDrag}
            stageScale={stageScale}
            onSelect={handleSelect}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onContextMenu={handleContextMenu}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
        )
      })}
    </Layer>
  )
}
