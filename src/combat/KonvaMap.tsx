import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Stage } from 'react-konva'
import type Konva from 'konva'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'
import type { TacticalInfo } from '../stores/worldStore'
import { useUiStore } from '../stores/uiStore'
import { KonvaGrid } from './KonvaGrid'
import { KonvaTokenLayer } from './KonvaTokenLayer'
import type { TokenContextMenuEvent, TokenHoverEvent } from './KonvaTokenLayer'
import { TokenContextMenu } from './TokenContextMenu'
import { TokenTooltip } from './TokenTooltip'
import { ActiveToolCanvas } from './ActiveToolCanvas'
import { snapToGrid, resolveTokenEntity } from './combatUtils'
import { useToast } from '../ui/useToast'
import { useCameraControls } from './hooks/useCameraControls'
import { useTokenAwareness } from './hooks/useTokenAwareness'
import { useEntityDrop } from './hooks/useEntityDrop'
import { BackgroundLayer } from './BackgroundLayer'
import { toolRegistry } from './tools/toolRegistry'
import { isPanGesture, isDragBeyondThreshold } from './hooks/useCanvasGestures'
import { SelectionActionBar } from './SelectionActionBar'

interface ContextMenuState {
  screenX: number
  screenY: number
  tokenId: string | null
  mapX: number
  mapY: number
}

export interface KonvaMapHandle {
  zoomIn: () => void
  zoomOut: () => void
  fitToWindow: () => void
  resetCenter: () => void
}

interface MarqueeState {
  startMapX: number
  startMapY: number
  endMapX: number
  endMapY: number
  startScreenX: number
  startScreenY: number
  endScreenX: number
  endScreenY: number
}

interface KonvaMapProps {
  tacticalInfo: TacticalInfo | null
  tokens: MapToken[]
  getEntity: (id: string) => Entity | null
  mySeatId: string
  role: 'GM' | 'PL'
  selectedTokenIds: string[]
  primarySelectedTokenId: string | null
  onSelectToken: (id: string) => void
  onToggleSelection: (id: string) => void
  onClearSelection: () => void
  onSetSelectedTokenIds: (ids: string[]) => void
  onUpdateToken: (id: string, updates: Partial<MapToken>) => void
  onDeleteToken: (id: string) => void
  onAddToken: (token: MapToken) => void
  onDropEntityOnMap?: (entityId: string, mapX: number, mapY: number) => void
  gmViewAsPlayer?: boolean
}

export const KonvaMap = forwardRef<KonvaMapHandle, KonvaMapProps>(function KonvaMap(
  {
    tacticalInfo,
    tokens,
    getEntity,
    mySeatId,
    role,
    selectedTokenIds,
    primarySelectedTokenId,
    onSelectToken,
    onToggleSelection,
    onClearSelection,
    onSetSelectedTokenIds,
    onUpdateToken,
    onDeleteToken,
    onAddToken,
    onDropEntityOnMap,
    gmViewAsPlayer = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Toast for undo-able actions
  const { toast } = useToast()

  // Active tool from UI store
  const activeTool = useUiStore((s) => s.activeTool)
  const activeTargetingRequest = useUiStore((s) => s.activeTargetingRequest)
  const addTargetingTarget = useUiStore((s) => s.addTargetingTarget)
  const cancelTargeting = useUiStore((s) => s.cancelTargeting)

  // Token layer listening: only interactive when active tool is 'interaction' category
  const tokenLayerListening = toolRegistry.get(activeTool)?.category === 'interaction'

  // Camera controls (zoom, pan)
  const {
    stageScale,
    stagePos,
    handleWheel,
    handleFitToWindow,
    handleResetCenter,
    handleZoomIn,
    handleZoomOut,
    startPan,
    updatePan,
    endPan,
  } = useCameraControls({ tacticalInfo, containerSize })

  // Expose camera controls via imperative handle for TacticalToolbar
  useImperativeHandle(
    ref,
    () => ({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      fitToWindow: handleFitToWindow,
      resetCenter: handleResetCenter,
    }),
    [handleZoomIn, handleZoomOut, handleFitToWindow, handleResetCenter],
  )

  // Token awareness (real-time drag broadcasting)
  const { remoteTokenDrags, handleTokenDragMove, handleTokenDragEnd } = useTokenAwareness(mySeatId)

  // Entity drop from portrait bar
  const { handleDragOver, handleDrop } = useEntityDrop({
    containerRef,
    stagePos,
    stageScale,
    tacticalInfo,
    onDropEntityOnMap,
  })

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Tooltip state
  const [tooltipState, setTooltipState] = useState<TokenHoverEvent | null>(null)

  // Track container offset for screen coordinate calculations
  const containerOffsetRef = useRef({ x: 0, y: 0 })

  // Right-click pan state machine
  const rightButtonDownRef = useRef(false)
  const rightButtonStartRef = useRef<{ x: number; y: number } | null>(null)
  const isPanningRef = useRef(false)

  // Track container size with ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateOffset = () => {
      const rect = container.getBoundingClientRect()
      containerOffsetRef.current = { x: rect.left, y: rect.top }
    }

    const observer = new ResizeObserver((entries) => {
      // ResizeObserver always provides at least one entry for the observed element
      const entry = entries[0]
      if (!entry) return
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
      updateOffset()
    })
    observer.observe(container)

    // Initial size
    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight,
    })
    updateOffset()

    return () => {
      observer.disconnect()
    }
  }, [])

  // Marquee selection state
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const marqueeStartRef = useRef<{
    mapX: number
    mapY: number
    screenX: number
    screenY: number
  } | null>(null)

  // Action targeting: intercept token clicks
  const isTargeting = activeTargetingRequest !== null

  const handleTargetToken = useCallback(
    (tokenId: string) => {
      if (!activeTargetingRequest) return
      const token = tokens.find((t) => t.id === tokenId)
      if (!token) return
      const entity = getEntity(token.entityId)
      if (!entity) return

      const targetIndex = activeTargetingRequest.collectedTargets.length
      const labels = activeTargetingRequest.action.targeting?.labels
      addTargetingTarget({
        tokenId,
        entity,
        index: targetIndex,
        label: labels?.[targetIndex],
      })
    },
    [activeTargetingRequest, tokens, getEntity, addTargetingTarget],
  )

  // Delete key: batch delete all selected tokens; Escape cancels targeting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape' && activeTargetingRequest) {
        cancelTargeting()
        e.preventDefault()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTokenIds.length === 0) return
        // Save all selected tokens for undo
        const selectedTokens = tokens.filter((t) => selectedTokenIds.includes(t.id))
        if (selectedTokens.length === 0) return
        for (const t of selectedTokens) {
          onDeleteToken(t.id)
        }
        onClearSelection()
        const count = selectedTokens.length
        toast('undo', count === 1 ? 'Token deleted' : `${count} tokens deleted`, {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              for (const t of selectedTokens) {
                onAddToken(t)
              }
            },
          },
        })
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    selectedTokenIds,
    tokens,
    onDeleteToken,
    onAddToken,
    onClearSelection,
    toast,
    activeTargetingRequest,
    cancelTargeting,
  ])

  // Click on empty space to deselect
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Only deselect when clicking directly on the stage or a Layer (not on a token)
      const target = e.target
      const stage = target.getStage()
      const isStage = target === stage
      const isLayer = target.nodeType === 'Layer'
      if ((isStage || isLayer) && selectedTokenIds.length > 0) {
        onClearSelection()
      }
    },
    [selectedTokenIds.length, onClearSelection],
  )

  // Token context menu handler from KonvaTokenLayer
  const handleTokenContextMenu = useCallback((event: TokenContextMenuEvent) => {
    setTooltipState(null)
    setContextMenu({
      screenX: event.screenX,
      screenY: event.screenY,
      tokenId: event.tokenId,
      mapX: event.mapX,
      mapY: event.mapY,
    })
  }, [])

  // Token hover handler
  const handleTokenHover = useCallback(
    (event: TokenHoverEvent | null) => {
      // Don't show tooltip while context menu is open
      if (contextMenu) return
      setTooltipState(event)
    },
    [contextMenu],
  )

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Unified mouse event handlers for right-click pan state machine + left-drag marquee
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanGesture(e.evt)) {
        // Right button: start tracking for pan
        rightButtonDownRef.current = true
        rightButtonStartRef.current = { x: e.evt.clientX, y: e.evt.clientY }
        isPanningRef.current = false
        return
      }
      // Left button on empty space in select mode: start marquee
      if (e.evt.button === 0 && tokenLayerListening) {
        const target = e.target
        const stage = target.getStage()
        const isStage = target === stage
        const isLayer = target.nodeType === 'Layer'
        if (isStage || isLayer) {
          const pointer = stage?.getRelativePointerPosition()
          if (pointer) {
            marqueeStartRef.current = {
              mapX: pointer.x,
              mapY: pointer.y,
              screenX: e.evt.clientX,
              screenY: e.evt.clientY,
            }
          }
        }
      }
    },
    [tokenLayerListening],
  )

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Right-click pan
      if (rightButtonDownRef.current && rightButtonStartRef.current) {
        const startPos = rightButtonStartRef.current

        if (!isPanningRef.current) {
          if (isDragBeyondThreshold(startPos.x, startPos.y, e.evt.clientX, e.evt.clientY)) {
            isPanningRef.current = true
            startPan(e.evt.clientX, e.evt.clientY)
          }
        } else {
          updatePan(e.evt.clientX, e.evt.clientY)
        }
        return
      }

      // Left-drag marquee
      if (marqueeStartRef.current) {
        const start = marqueeStartRef.current
        if (isDragBeyondThreshold(start.screenX, start.screenY, e.evt.clientX, e.evt.clientY)) {
          const stage = e.target.getStage()
          const pointer = stage?.getRelativePointerPosition()
          if (pointer) {
            setMarquee({
              startMapX: start.mapX,
              startMapY: start.mapY,
              endMapX: pointer.x,
              endMapY: pointer.y,
              startScreenX: start.screenX,
              startScreenY: start.screenY,
              endScreenX: e.evt.clientX,
              endScreenY: e.evt.clientY,
            })
          }
        }
      }
    },
    [startPan, updatePan],
  )

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Left button up: finish marquee if active
      if (e.evt.button === 0 && marqueeStartRef.current) {
        if (marquee) {
          // Determine which tokens are inside the marquee rect (map coords)
          const minX = Math.min(marquee.startMapX, marquee.endMapX)
          const maxX = Math.max(marquee.startMapX, marquee.endMapX)
          const minY = Math.min(marquee.startMapY, marquee.endMapY)
          const maxY = Math.max(marquee.startMapY, marquee.endMapY)

          const insideIds = tokens
            .filter((t) => {
              // Use token center for hit test
              const pixelSize = t.width * (tacticalInfo?.grid.size ?? 70)
              const cx = t.x + pixelSize / 2
              const cy = t.y + pixelSize / 2
              return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY
            })
            .map((t) => t.id)

          if (insideIds.length > 0) {
            onSetSelectedTokenIds(insideIds)
          } else {
            onClearSelection()
          }
          setMarquee(null)
        }
        marqueeStartRef.current = null
        return
      }

      if (!isPanGesture(e.evt)) return
      if (!rightButtonDownRef.current) return

      if (!isPanningRef.current && activeTargetingRequest) {
        cancelTargeting()
        // Reset state
        rightButtonDownRef.current = false
        rightButtonStartRef.current = null
        isPanningRef.current = false
        return
      }

      if (isPanningRef.current) {
        // Was panning — end pan
        endPan()
      } else {
        // Right click without drag (delta < threshold) — open context menu (GM only)
        if (role === 'GM') {
          const target = e.target
          const stage = target.getStage()
          const isStage = target === stage
          const isLayer = target.nodeType === 'Layer'

          // Only show context menu on empty space, not on tokens
          if (isStage || isLayer) {
            // Stop DOM propagation so the App-level context menu doesn't also open
            e.evt.stopPropagation()

            const pointer = stage?.getRelativePointerPosition()
            if (pointer) {
              setContextMenu({
                screenX: e.evt.clientX,
                screenY: e.evt.clientY,
                tokenId: null,
                mapX: pointer.x,
                mapY: pointer.y,
              })
            }
          }
        }
      }

      // Reset state
      rightButtonDownRef.current = false
      rightButtonStartRef.current = null
      isPanningRef.current = false
    },
    [
      endPan,
      role,
      marquee,
      tokens,
      tacticalInfo?.grid.size,
      onSetSelectedTokenIds,
      onClearSelection,
      activeTargetingRequest,
      cancelTargeting,
    ],
  )

  // Prevent browser context menu and stop bubbling to App-level handler
  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Create token on empty space — spawns an ephemeral entity + tactical token
  const handleCreateToken = useCallback(
    (mapX: number, mapY: number) => {
      if (!tacticalInfo) return
      let x = mapX
      let y = mapY
      if (tacticalInfo.grid.snap) {
        const snapped = snapToGrid(
          x,
          y,
          tacticalInfo.grid.size,
          tacticalInfo.grid.offsetX,
          tacticalInfo.grid.offsetY,
        )
        x = snapped.x
        y = snapped.y
      }
      void useWorldStore.getState().createToken(x, y)
    },
    [tacticalInfo],
  )

  // Copy token (create duplicate at offset)
  const handleCopyToken = useCallback((tokenId: string) => {
    void useWorldStore.getState().duplicateToken(tokenId)
  }, [])

  // Undo-able token deletion (context menu — deletes all selected if target is selected)
  const handleDeleteToken = useCallback(
    (tokenId: string) => {
      // If the target token is in the selection, batch-delete all selected tokens
      const idsToDelete = selectedTokenIds.includes(tokenId) ? selectedTokenIds : [tokenId]
      const tokensToDelete = tokens.filter((t) => idsToDelete.includes(t.id))
      if (tokensToDelete.length === 0) return
      for (const t of tokensToDelete) {
        onDeleteToken(t.id)
      }
      onClearSelection()
      const count = tokensToDelete.length
      toast('undo', count === 1 ? 'Token deleted' : `${count} tokens deleted`, {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            for (const t of tokensToDelete) {
              onAddToken(t)
            }
          },
        },
      })
    },
    [tokens, selectedTokenIds, onDeleteToken, onAddToken, onClearSelection, toast],
  )

  // Resolve token + entity for context menu and tooltip
  const [contextMenuToken, contextMenuEntity] = resolveTokenEntity(
    tokens,
    contextMenu?.tokenId,
    getEntity,
  )
  const [tooltipToken, tooltipEntity] = resolveTokenEntity(tokens, tooltipState?.tokenId, getEntity)

  // No tacticalInfo state (no active scene)
  if (!tacticalInfo) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
          color: '#666',
          fontFamily: 'sans-serif',
          fontSize: 16,
        }}
      >
        No combat scene selected
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
        position: 'relative',
        cursor: isTargeting ? 'crosshair' : undefined,
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={handleContainerContextMenu}
    >
      {containerSize.width > 0 && containerSize.height > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={false}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
          {/* Background layer — non-interactive */}
          <BackgroundLayer tacticalInfo={tacticalInfo} />

          {/* Grid layer — non-interactive */}
          <KonvaGrid
            width={tacticalInfo.mapWidth ?? 0}
            height={tacticalInfo.mapHeight ?? 0}
            gridSize={tacticalInfo.grid.size}
            gridVisible={tacticalInfo.grid.visible}
            gridColor={tacticalInfo.grid.color}
            gridOffsetX={tacticalInfo.grid.offsetX}
            gridOffsetY={tacticalInfo.grid.offsetY}
          />

          {/* Token layer — interactive only when tool category is 'interaction' */}
          <KonvaTokenLayer
            listening={tokenLayerListening}
            tokens={tokens}
            getEntity={getEntity}
            tacticalInfo={tacticalInfo}
            role={role}
            mySeatId={mySeatId}
            selectedTokenIds={selectedTokenIds}
            primarySelectedTokenId={primarySelectedTokenId}
            onSelectToken={isTargeting ? handleTargetToken : onSelectToken}
            onToggleSelection={isTargeting ? handleTargetToken : onToggleSelection}
            onUpdateToken={onUpdateToken}
            stageScale={stageScale}
            stagePos={stagePos}
            containerOffset={containerOffsetRef.current}
            onTokenContextMenu={handleTokenContextMenu}
            onTokenHover={handleTokenHover}
            gmViewAsPlayer={gmViewAsPlayer}
            onTokenDragMove={handleTokenDragMove}
            onTokenDragEnd={handleTokenDragEnd}
            remoteTokenDrags={remoteTokenDrags}
          />

          {/* Active tool canvas layer — above tokens */}
          <ActiveToolCanvas
            stageRef={stageRef}
            tacticalInfo={tacticalInfo}
            stageScale={stageScale}
            stagePos={stagePos}
            gridSize={tacticalInfo.grid.size}
            gridSnap={tacticalInfo.grid.snap}
          />
        </Stage>
      )}

      {/* Context menu — HTML overlay */}
      {contextMenu && (
        <TokenContextMenu
          x={contextMenu.screenX}
          y={contextMenu.screenY}
          tokenId={contextMenu.tokenId}
          token={contextMenuToken}
          entity={contextMenuEntity}
          role={role}
          selectedTokenIds={selectedTokenIds}
          onClose={handleCloseContextMenu}
          onDeleteToken={handleDeleteToken}
          onUpdateToken={onUpdateToken}
          onCreateToken={handleCreateToken}
          onCopyToken={handleCopyToken}
          mapX={contextMenu.mapX}
          mapY={contextMenu.mapY}
        />
      )}

      {/* Tooltip — HTML overlay */}
      {tooltipState && tooltipToken && (
        <TokenTooltip
          token={tooltipToken}
          entity={tooltipEntity}
          screenX={tooltipState.screenX}
          screenY={tooltipState.screenY}
        />
      )}

      {/* Marquee selection overlay */}
      {marquee && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(marquee.startScreenX, marquee.endScreenX),
            top: Math.min(marquee.startScreenY, marquee.endScreenY),
            width: Math.abs(marquee.endScreenX - marquee.startScreenX),
            height: Math.abs(marquee.endScreenY - marquee.startScreenY),
            border: '1px dashed rgba(255, 255, 255, 0.8)',
            backgroundColor: 'rgba(100, 149, 237, 0.15)',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
      )}

      {/* Targeting mode prompt bar */}
      {activeTargetingRequest && (
        <div
          className="fixed z-ui left-1/2 top-4 bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] px-4 py-2 pointer-events-auto"
          style={{ transform: 'translateX(-50%)' }}
        >
          <span className="text-text-primary text-sm font-medium">
            {activeTargetingRequest.action.targeting?.labels?.[
              activeTargetingRequest.collectedTargets.length
            ] ??
              `Select target ${activeTargetingRequest.collectedTargets.length + 1}/${activeTargetingRequest.action.targeting?.count ?? 1}`}
          </span>
          <span className="text-text-muted text-xs ml-3">Right-click to cancel</span>
        </div>
      )}

      {/* Selection action bar — plugin-provided token actions */}
      <SelectionActionBar
        tokens={tokens}
        selectedTokenIds={selectedTokenIds}
        primarySelectedTokenId={primarySelectedTokenId}
        getEntity={getEntity}
        role={role}
        stageScale={stageScale}
        stagePos={stagePos}
        containerOffset={containerOffsetRef.current}
        gridSize={tacticalInfo.grid.size}
      />
    </div>
  )
})
