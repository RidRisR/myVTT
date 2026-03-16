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
import { MeasureTool } from './tools/MeasureTool'
import { RangeTemplate } from './tools/RangeTemplate'
import { snapToGrid } from './combatUtils'
import { useToast } from '../shared/ui/useToast'
import { useCameraControls } from './hooks/useCameraControls'
import { useTokenAwareness } from './hooks/useTokenAwareness'
import { useEntityDrop } from './hooks/useEntityDrop'
import { BackgroundLayer } from './BackgroundLayer'

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

interface KonvaMapProps {
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
  gmViewAsPlayer?: boolean
}

export const KonvaMap = forwardRef<KonvaMapHandle, KonvaMapProps>(function KonvaMap(
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
  const isSelectMode = activeTool === 'select'

  // Camera controls (zoom, pan)
  const {
    stageScale,
    stagePos,
    handleWheel,
    handleFitToWindow,
    handleResetCenter,
    handleZoomIn,
    handleZoomOut,
    handleDragEnd,
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

  // Click on empty space to deselect
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      // Only deselect when clicking directly on the stage or a Layer (not on a token)
      const target = e.target
      const stage = target.getStage()
      const isStage = target === stage
      const isLayer = target.nodeType === 'Layer'
      if ((isStage || isLayer) && selectedTokenId) {
        onSelectToken(null)
      }
    },
    [selectedTokenId, onSelectToken],
  )

  // Right-click on empty stage area
  const handleStageContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault()
      if (role !== 'GM') return

      const target = e.target
      const stage = target.getStage()
      const isStage = target === stage
      const isLayer = target.nodeType === 'Layer'

      // Only handle right-click on empty space (stage/layer), not on tokens
      if (!isStage && !isLayer) return

      // Stop DOM propagation so the App-level context menu doesn't also open
      e.evt.stopPropagation()

      const pointer = stage?.getRelativePointerPosition()
      if (!pointer) return

      setContextMenu({
        screenX: e.evt.clientX,
        screenY: e.evt.clientY,
        tokenId: null,
        mapX: pointer.x,
        mapY: pointer.y,
      })
    },
    [role],
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

  // Undo-able token deletion
  const handleDeleteToken = useCallback(
    (tokenId: string) => {
      const token = tokens.find((t) => t.id === tokenId)
      if (!token) return
      onDeleteToken(tokenId)
      toast('undo', 'Token deleted', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: () => {
            onAddToken(token)
          },
        },
      })
    },
    [tokens, onDeleteToken, onAddToken, toast],
  )

  // Resolve context menu token + entity
  const contextMenuToken = contextMenu?.tokenId
    ? (tokens.find((t) => t.id === contextMenu.tokenId) ?? null)
    : null
  const contextMenuEntity = contextMenuToken?.entityId ? getEntity(contextMenuToken.entityId) : null

  // Resolve tooltip token + entity
  const tooltipToken = tooltipState
    ? (tokens.find((t) => t.id === tooltipState.tokenId) ?? null)
    : null
  const tooltipEntity = tooltipToken?.entityId ? getEntity(tooltipToken.entityId) : null

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
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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
          draggable={isSelectMode}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onDragEnd={handleDragEnd}
          onContextMenu={handleStageContextMenu}
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

          {/* Token layer — interactive */}
          <KonvaTokenLayer
            tokens={tokens}
            getEntity={getEntity}
            tacticalInfo={tacticalInfo}
            role={role}
            mySeatId={mySeatId}
            selectedTokenId={selectedTokenId}
            onSelectToken={onSelectToken}
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

          {/* Measurement tool layer — above tokens */}
          <MeasureTool
            active={activeTool === 'measure'}
            tacticalInfo={tacticalInfo}
            stageRef={stageRef}
          />

          {/* Range template layer — above tokens */}
          <RangeTemplate activeTool={activeTool} tacticalInfo={tacticalInfo} stageRef={stageRef} />
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
    </div>
  )
})
