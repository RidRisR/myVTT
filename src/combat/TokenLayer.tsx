import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransformContext } from 'react-zoom-pan-pinch'
import type { CombatToken } from './combatTypes'
import type { Character } from '../shared/characterTypes'
import type { Scene } from '../yjs/useScenes'
import { MapToken } from './MapToken'
import { canDragToken, screenToMap, snapToGrid } from './combatUtils'

interface TokenLayerProps {
  tokens: CombatToken[]
  getCharacter: (id: string) => Character | null
  scene: Scene
  role: 'GM' | 'PL'
  mySeatId: string
  selectedTokenId: string | null
  onSelectToken: (id: string | null) => void
  onUpdateToken: (id: string, updates: Partial<CombatToken>) => void
}

interface DragState {
  tokenId: string
  startMapX: number
  startMapY: number
  currentMapX: number
  currentMapY: number
}

export function TokenLayer({
  tokens,
  getCharacter,
  scene,
  role,
  mySeatId,
  selectedTokenId,
  onSelectToken,
  onUpdateToken,
}: TokenLayerProps) {
  const ctx = useTransformContext()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const didDragRef = useRef(false)

  // Filter tokens by visibility, skip orphan tokens (no character)
  const visibleTokens = tokens.filter(t => {
    const char = getCharacter(t.characterId)
    if (!char) return false
    if (role === 'GM') return true
    return !t.gmOnly
  })

  const handlePointerDown = useCallback((e: React.PointerEvent, tokenId: string) => {
    const token = tokens.find(t => t.id === tokenId)
    if (!token) return
    const char = getCharacter(token.characterId)
    if (!char) return
    if (!canDragToken(role, char.seatId ?? null, mySeatId)) return

    const wrapper = ctx.wrapperComponent
    if (!wrapper) return

    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const wrapperRect = wrapper.getBoundingClientRect()
    const { scale, positionX, positionY } = ctx.transformState
    const { mapX, mapY } = screenToMap(e.clientX, e.clientY, wrapperRect, scale, positionX, positionY)

    const state: DragState = {
      tokenId,
      startMapX: mapX,
      startMapY: mapY,
      currentMapX: token.x,
      currentMapY: token.y,
    }
    dragRef.current = state
    didDragRef.current = false
    setDrag(state)
  }, [tokens, getCharacter, role, mySeatId, ctx])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return

    const wrapper = ctx.wrapperComponent
    if (!wrapper) return

    const wrapperRect = wrapper.getBoundingClientRect()
    const { scale, positionX, positionY } = ctx.transformState
    const { mapX, mapY } = screenToMap(e.clientX, e.clientY, wrapperRect, scale, positionX, positionY)

    const token = tokens.find(t => t.id === d.tokenId)
    if (!token) return

    const dx = mapX - d.startMapX
    const dy = mapY - d.startMapY

    // Only start visual drag after a small threshold
    if (!didDragRef.current && Math.abs(dx) + Math.abs(dy) > 3) {
      didDragRef.current = true
    }

    if (didDragRef.current) {
      const newState = {
        ...d,
        currentMapX: token.x + dx,
        currentMapY: token.y + dy,
      }
      dragRef.current = newState
      setDrag(newState)
    }
  }, [tokens, ctx])

  const handlePointerUp = useCallback((_e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return

    if (didDragRef.current) {
      // Snap to grid and write to Yjs
      const snapped = snapToGrid(
        d.currentMapX, d.currentMapY,
        scene.gridSize, scene.gridOffsetX, scene.gridOffsetY,
      )
      onUpdateToken(d.tokenId, { x: snapped.x, y: snapped.y })
    }

    dragRef.current = null
    didDragRef.current = false
    setDrag(null)
  }, [scene, onUpdateToken])

  // Attach global pointer listeners during drag
  useEffect(() => {
    if (!drag) return
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [drag, handlePointerMove, handlePointerUp])

  const handleClick = (tokenId: string) => {
    // Don't toggle selection if we just finished dragging
    if (didDragRef.current) return
    onSelectToken(selectedTokenId === tokenId ? null : tokenId)
  }

  // Click on empty space to deselect
  const handleBackgroundClick = () => {
    if (selectedTokenId) onSelectToken(null)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: scene.width,
        height: scene.height,
      }}
      onClick={handleBackgroundClick}
    >
      {visibleTokens.map(token => {
        const character = getCharacter(token.characterId)!
        const isDragging = drag?.tokenId === token.id && didDragRef.current
        return (
          <MapToken
            key={token.id}
            token={token}
            character={character}
            pixelSize={token.size * scene.gridSize}
            selected={token.id === selectedTokenId}
            gmOnly={token.gmOnly && role === 'GM'}
            dragging={isDragging ?? false}
            dragX={isDragging ? drag!.currentMapX : undefined}
            dragY={isDragging ? drag!.currentMapY : undefined}
            onPointerDown={handlePointerDown}
            onClick={handleClick}
          />
        )
      })}
    </div>
  )
}
