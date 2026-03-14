import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image, Text, Rect } from 'react-konva'
import type Konva from 'konva'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useWorldStore } from '../stores/worldStore'
import type { CombatInfo } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { useUiStore } from '../stores/uiStore'
import { useIdentityStore } from '../stores/identityStore'
import { KonvaGrid } from './KonvaGrid'
import { KonvaTokenLayer } from './KonvaTokenLayer'
import type { TokenContextMenuEvent, TokenHoverEvent } from './KonvaTokenLayer'
import { TokenContextMenu } from './TokenContextMenu'
import { TokenTooltip } from './TokenTooltip'
import { MeasureTool } from './tools/MeasureTool'
import { RangeTemplate } from './tools/RangeTemplate'
import { useImage } from './useImage'
import { generateTokenId } from '../shared/idUtils'
import { snapToGrid } from './combatUtils'
import { useToast } from '../shared/ui/useToast'

// Random pastel-ish colors for new tokens
const TOKEN_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#9b59b6',
  '#f39c12',
  '#1abc9c',
  '#e67e22',
  '#e91e63',
  '#00bcd4',
  '#8bc34a',
]

function randomColor(): string {
  return TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)]
}

interface ContextMenuState {
  screenX: number
  screenY: number
  tokenId: string | null
  mapX: number
  mapY: number
}

interface KonvaMapProps {
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
  gmViewAsPlayer?: boolean
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const SCALE_BY = 1.05

export function KonvaMap({
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
  gmViewAsPlayer = false,
}: KonvaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })

  // Toast for undo-able actions
  const { toast } = useToast()

  // Active tool from UI store
  const activeTool = useUiStore((s) => s.activeTool)
  const isSelectMode = activeTool === 'select'

  // Awareness for real-time token drag broadcasting via Socket.io
  const socket = useWorldStore((s) => s._socket)
  const mySeat = useIdentityStore((s) => s.getMySeat())
  const [remoteTokenDrags, setRemoteTokenDrags] = useState<
    Map<string, { tokenId: string; x: number; y: number; color: string }>
  >(() => new Map())

  useEffect(() => {
    if (!socket) return
    const onDrag = (data: { tokenId: string; x: number; y: number; color: string; seatId: string }) => {
      if (data.seatId === mySeatId) return
      setRemoteTokenDrags((prev) => {
        const next = new Map(prev)
        next.set(data.seatId, data)
        return next
      })
    }
    const onDragEnd = ({ seatId }: { seatId: string }) => {
      if (seatId === mySeatId) return
      setRemoteTokenDrags((prev) => {
        if (!prev.has(seatId)) return prev
        const next = new Map(prev)
        next.delete(seatId)
        return next
      })
    }
    const onRemove = ({ seatId }: { seatId: string }) => {
      setRemoteTokenDrags((prev) => {
        if (!prev.has(seatId)) return prev
        const next = new Map(prev)
        next.delete(seatId)
        return next
      })
    }
    socket.on('awareness:tokenDrag', onDrag)
    socket.on('awareness:tokenDragEnd', onDragEnd)
    socket.on('awareness:remove', onRemove)
    return () => {
      socket.off('awareness:tokenDrag', onDrag)
      socket.off('awareness:tokenDragEnd', onDragEnd)
      socket.off('awareness:remove', onRemove)
    }
  }, [socket, mySeatId])

  const handleTokenDragMove = useCallback(
    (tokenId: string, x: number, y: number) => {
      if (!socket || !mySeat || !mySeatId) return
      socket.emit('awareness:tokenDrag', { tokenId, x, y, color: mySeat.color, seatId: mySeatId })
    },
    [socket, mySeat, mySeatId],
  )

  const handleTokenDragEnd = useCallback(() => {
    if (!socket || !mySeatId) return
    socket.emit('awareness:tokenDragEnd', { seatId: mySeatId })
  }, [socket, mySeatId])

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
      const entry = entries[0]
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
        updateOffset()
      }
    })
    observer.observe(container)

    // Initial size
    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight,
    })
    updateOffset()

    return () => observer.disconnect()
  }, [])

  // Wheel zoom toward mouse pointer
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    if (!stage) return

    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, direction > 0 ? oldScale * SCALE_BY : oldScale / SCALE_BY),
    )

    setStageScale(newScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }, [])

  // Fit map to window
  const handleFitToWindow = useCallback(() => {
    if (!combatInfo || containerSize.width === 0 || containerSize.height === 0) return
    if (combatInfo.mapWidth === 0 || combatInfo.mapHeight === 0) return

    const scaleX = containerSize.width / combatInfo.mapWidth
    const scaleY = containerSize.height / combatInfo.mapHeight
    const fitScale = Math.min(scaleX, scaleY) * 0.95 // 95% to add some padding

    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale))

    setStageScale(clampedScale)
    setStagePos({
      x: (containerSize.width - combatInfo.mapWidth * clampedScale) / 2,
      y: (containerSize.height - combatInfo.mapHeight * clampedScale) / 2,
    })
  }, [combatInfo, containerSize])

  // Reset to center at scale 1
  const handleResetCenter = useCallback(() => {
    if (!combatInfo) return
    setStageScale(1)
    setStagePos({
      x: (containerSize.width - combatInfo.mapWidth) / 2,
      y: (containerSize.height - combatInfo.mapHeight) / 2,
    })
  }, [combatInfo, containerSize])

  // Zoom in / out buttons
  const handleZoomIn = useCallback(() => {
    const centerX = containerSize.width / 2
    const centerY = containerSize.height / 2

    setStageScale((prev) => {
      const newScale = Math.min(MAX_SCALE, prev * SCALE_BY * SCALE_BY)
      setStagePos((prevPos) => ({
        x: centerX - ((centerX - prevPos.x) / prev) * newScale,
        y: centerY - ((centerY - prevPos.y) / prev) * newScale,
      }))
      return newScale
    })
  }, [containerSize])

  const handleZoomOut = useCallback(() => {
    const centerX = containerSize.width / 2
    const centerY = containerSize.height / 2

    setStageScale((prev) => {
      const newScale = Math.max(MIN_SCALE, prev / SCALE_BY / SCALE_BY)
      setStagePos((prevPos) => ({
        x: centerX - ((centerX - prevPos.x) / prev) * newScale,
        y: centerY - ((centerY - prevPos.y) / prev) * newScale,
      }))
      return newScale
    })
  }, [containerSize])

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

  // Handle stage drag end to update position state
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    // Only handle stage-level drags, not token drags
    const stage = e.target.getStage()
    if (e.target !== stage) return
    setStagePos({ x: stage.x(), y: stage.y() })
  }, [])

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

  // Create token on empty space
  const handleCreateToken = useCallback(
    (mapX: number, mapY: number) => {
      if (!combatInfo) return
      let x = mapX
      let y = mapY
      if (combatInfo.grid.snap) {
        const snapped = snapToGrid(
          x,
          y,
          combatInfo.grid.size,
          combatInfo.grid.offsetX,
          combatInfo.grid.offsetY,
        )
        x = snapped.x
        y = snapped.y
      }
      const newToken: MapToken = {
        id: generateTokenId(),
        x,
        y,
        size: 1,
        color: randomColor(),
        permissions: { default: 'observer', seats: {} },
      }
      onAddToken(newToken)
    },
    [combatInfo, onAddToken],
  )

  // Copy token (create duplicate at offset)
  const handleCopyToken = useCallback(
    (token: MapToken) => {
      if (!combatInfo) return
      const gridSize = combatInfo.grid.size
      const newToken: MapToken = {
        ...token,
        id: generateTokenId(),
        x: token.x + gridSize,
        y: token.y + gridSize,
      }
      onAddToken(newToken)
    },
    [combatInfo, onAddToken],
  )

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
          onClick: () => onAddToken(token),
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

  // No combatInfo state
  if (!combatInfo) {
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
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-entity-id')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        const entityId = e.dataTransfer.getData('application/x-entity-id')
        if (!entityId || !onDropEntityOnMap) return

        // Convert screen coordinates to map coordinates
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const screenX = e.clientX - rect.left
        const screenY = e.clientY - rect.top
        // Inverse of stage transform: mapCoord = (screenCoord - stagePos) / stageScale
        let mapX = (screenX - stagePos.x) / stageScale
        let mapY = (screenY - stagePos.y) / stageScale

        // Grid snap
        if (combatInfo?.grid.snap) {
          const snapped = snapToGrid(
            mapX,
            mapY,
            combatInfo.grid.size,
            combatInfo.grid.offsetX,
            combatInfo.grid.offsetY,
          )
          mapX = snapped.x
          mapY = snapped.y
        }

        onDropEntityOnMap(entityId, mapX, mapY)
      }}
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
          <BackgroundLayer combatInfo={combatInfo} />

          {/* Grid layer — non-interactive */}
          <KonvaGrid
            width={combatInfo.mapWidth}
            height={combatInfo.mapHeight}
            gridSize={combatInfo.grid.size}
            gridVisible={combatInfo.grid.visible}
            gridColor={combatInfo.grid.color}
            gridOffsetX={combatInfo.grid.offsetX}
            gridOffsetY={combatInfo.grid.offsetY}
          />

          {/* Token layer — interactive */}
          <KonvaTokenLayer
            tokens={tokens}
            getEntity={getEntity}
            combatInfo={combatInfo}
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
            combatInfo={combatInfo}
            stageRef={stageRef}
          />

          {/* Range template layer — above tokens */}
          <RangeTemplate activeTool={activeTool} combatInfo={combatInfo} stageRef={stageRef} />
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

      {/* Zoom helper controls — HTML overlay */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <ZoomButton label="+" onClick={handleZoomIn} title="Zoom in" />
        <ZoomButton label="\u2212" onClick={handleZoomOut} title="Zoom out" />
        <ZoomButton label="\u2922" onClick={handleFitToWindow} title="Fit to window" />
        <ZoomButton label="\u2316" onClick={handleResetCenter} title="Reset center" />
      </div>
    </div>
  )
}

// ── Background Layer ──

function BackgroundLayer({ combatInfo }: { combatInfo: CombatInfo }) {
  const imageUrl = combatInfo.mapUrl
  if (!imageUrl) return null // transparent when no tactical map image

  const isVideo = isVideoUrl(imageUrl)

  if (isVideo) {
    return (
      <VideoBackground url={imageUrl} width={combatInfo.mapWidth} height={combatInfo.mapHeight} />
    )
  }

  return (
    <ImageBackground
      url={imageUrl}
      width={combatInfo.mapWidth}
      height={combatInfo.mapHeight}
      name="Combat"
    />
  )
}

function ImageBackground({
  url,
  width,
  height,
  name,
}: {
  url: string
  width: number
  height: number
  name: string
}) {
  const [img, status] = useImage(url || undefined)

  return (
    <Layer listening={false}>
      {img && status === 'loaded' ? (
        <Image image={img} x={0} y={0} width={width} height={height} />
      ) : (
        <>
          <Rect x={0} y={0} width={width} height={height} fill="#1a1a2e" />
          <Text
            x={0}
            y={height / 2 - 10}
            width={width}
            text={url ? 'Loading...' : name || 'No image'}
            fontSize={16}
            fill="#666"
            fontFamily="sans-serif"
            align="center"
          />
        </>
      )}
    </Layer>
  )
}

function VideoBackground({ url, width, height }: { url: string; width: number; height: number }) {
  const imageRef = useRef<Konva.Image>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)

  useEffect(() => {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    videoRef.current = video

    video.addEventListener('loadeddata', () => {
      video.play().catch(() => {
        // Autoplay may be blocked
      })
    })

    // Animation loop to redraw the Konva Image each frame
    const animate = () => {
      const layer = imageRef.current?.getLayer()
      if (layer) {
        layer.batchDraw()
      }
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)

    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current)
      }
      video.pause()
      video.src = ''
      videoRef.current = null
    }
  }, [url])

  return (
    <Layer listening={false}>
      {videoRef.current && (
        <Image ref={imageRef} image={videoRef.current} x={0} y={0} width={width} height={height} />
      )}
    </Layer>
  )
}

// ── Zoom Button ──

function ZoomButton({
  label,
  onClick,
  title,
}: {
  label: string
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-7 h-7 rounded flex items-center justify-center p-0 leading-none text-base font-bold cursor-pointer border border-border-glass bg-glass backdrop-blur-[8px] text-text-primary hover:bg-hover transition-colors duration-fast"
    >
      {label}
    </button>
  )
}
