import { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Image, Text, Rect } from 'react-konva'
import type Konva from 'konva'
import type { MapToken, Entity } from '../shared/entityTypes'
import type { Scene } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { KonvaGrid } from './KonvaGrid'
import { KonvaTokenLayer } from './KonvaTokenLayer'
import { useImage } from './useImage'

interface KonvaMapProps {
  scene: Scene | null
  tokens: MapToken[]
  getEntity: (id: string) => Entity | null
  mySeatId: string
  role: 'GM' | 'PL'
  selectedTokenId: string | null
  onSelectToken: (id: string | null) => void
  onUpdateToken: (id: string, updates: Partial<MapToken>) => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const SCALE_BY = 1.05

export function KonvaMap({
  scene,
  tokens,
  getEntity,
  mySeatId,
  role,
  selectedTokenId,
  onSelectToken,
  onUpdateToken,
}: KonvaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })

  // Track container size with ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(container)

    // Initial size
    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight,
    })

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
    if (!scene || containerSize.width === 0 || containerSize.height === 0) return
    if (scene.width === 0 || scene.height === 0) return

    const scaleX = containerSize.width / scene.width
    const scaleY = containerSize.height / scene.height
    const fitScale = Math.min(scaleX, scaleY) * 0.95 // 95% to add some padding

    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale))

    setStageScale(clampedScale)
    setStagePos({
      x: (containerSize.width - scene.width * clampedScale) / 2,
      y: (containerSize.height - scene.height * clampedScale) / 2,
    })
  }, [scene, containerSize])

  // Reset to center at scale 1
  const handleResetCenter = useCallback(() => {
    if (!scene) return
    setStageScale(1)
    setStagePos({
      x: (containerSize.width - scene.width) / 2,
      y: (containerSize.height - scene.height) / 2,
    })
  }, [scene, containerSize])

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

  // No scene state
  if (!scene) {
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
        background: '#111',
        position: 'relative',
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
          draggable
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onDragEnd={handleDragEnd}
        >
          {/* Background layer — non-interactive */}
          <BackgroundLayer scene={scene} />

          {/* Grid layer — non-interactive */}
          <KonvaGrid
            width={scene.width}
            height={scene.height}
            gridSize={scene.gridSize}
            gridVisible={scene.gridVisible}
            gridColor={scene.gridColor}
            gridOffsetX={scene.gridOffsetX}
            gridOffsetY={scene.gridOffsetY}
          />

          {/* Token layer — interactive */}
          <KonvaTokenLayer
            tokens={tokens}
            getEntity={getEntity}
            scene={scene}
            role={role}
            mySeatId={mySeatId}
            selectedTokenId={selectedTokenId}
            onSelectToken={onSelectToken}
            onUpdateToken={onUpdateToken}
            stageScale={stageScale}
          />
        </Stage>
      )}

      {/* Zoom helper controls — HTML overlay */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 10,
        }}
      >
        <ZoomButton label="+" onClick={handleZoomIn} title="Zoom in" />
        <ZoomButton label="\u2212" onClick={handleZoomOut} title="Zoom out" />
        <ZoomButton label="\u2922" onClick={handleFitToWindow} title="Fit to window" />
        <ZoomButton label="\u2316" onClick={handleResetCenter} title="Reset center" />
      </div>
    </div>
  )
}

// ── Background Layer ──

function BackgroundLayer({ scene }: { scene: Scene }) {
  const imageUrl = scene.tacticalMapImageUrl || scene.atmosphereImageUrl
  const isVideo = isVideoUrl(imageUrl)

  if (isVideo) {
    return <VideoBackground url={imageUrl} width={scene.width} height={scene.height} />
  }

  return <ImageBackground url={imageUrl} width={scene.width} height={scene.height} name={scene.name} />
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

function VideoBackground({
  url,
  width,
  height,
}: {
  url: string
  width: number
  height: number
}) {
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
        <Image
          ref={imageRef}
          image={videoRef.current}
          x={0}
          y={0}
          width={width}
          height={height}
        />
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
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        border: '1px solid rgba(180,160,130,0.15)',
        background: 'rgba(20,15,12,0.88)',
        color: '#F0E6D8',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        lineHeight: 1,
        backdropFilter: 'blur(8px)',
      }}
    >
      {label}
    </button>
  )
}
