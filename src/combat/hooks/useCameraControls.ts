import { useState, useCallback, useRef } from 'react'
import type Konva from 'konva'
import type { TacticalInfo } from '../../stores/worldStore'

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const SCALE_BY = 1.05

interface UseCameraControlsParams {
  tacticalInfo: TacticalInfo | null
  containerSize: { width: number; height: number }
}

interface UseCameraControlsReturn {
  stageScale: number
  stagePos: { x: number; y: number }
  isPanning: boolean
  handleWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
  handleFitToWindow: () => void
  handleResetCenter: () => void
  handleZoomIn: () => void
  handleZoomOut: () => void
  startPan: (screenX: number, screenY: number) => void
  updatePan: (screenX: number, screenY: number) => void
  endPan: () => void
}

export function useCameraControls({
  tacticalInfo,
  containerSize,
}: UseCameraControlsParams): UseCameraControlsReturn {
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  // Track last screen position for delta-based pan
  const lastPanPosRef = useRef<{ x: number; y: number } | null>(null)

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
    if (containerSize.width === 0 || containerSize.height === 0) return
    const mw = tacticalInfo?.mapWidth ?? 0
    const mh = tacticalInfo?.mapHeight ?? 0
    if (mw === 0 || mh === 0) return

    const scaleX = containerSize.width / mw
    const scaleY = containerSize.height / mh
    const fitScale = Math.min(scaleX, scaleY) * 0.95 // 95% to add some padding

    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale))

    setStageScale(clampedScale)
    setStagePos({
      x: (containerSize.width - mw * clampedScale) / 2,
      y: (containerSize.height - mh * clampedScale) / 2,
    })
  }, [tacticalInfo, containerSize])

  // Reset to center at scale 1
  const handleResetCenter = useCallback(() => {
    const mw = tacticalInfo?.mapWidth ?? 0
    const mh = tacticalInfo?.mapHeight ?? 0
    setStageScale(1)
    setStagePos({
      x: (containerSize.width - mw) / 2,
      y: (containerSize.height - mh) / 2,
    })
  }, [tacticalInfo, containerSize])

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

  // Right-click pan: record start position in screen space
  const startPan = useCallback((screenX: number, screenY: number) => {
    lastPanPosRef.current = { x: screenX, y: screenY }
    setIsPanning(true)
  }, [])

  // Update pan by screen-space delta (no need to account for scale)
  const updatePan = useCallback((screenX: number, screenY: number) => {
    const last = lastPanPosRef.current
    if (!last) return

    const dx = screenX - last.x
    const dy = screenY - last.y
    lastPanPosRef.current = { x: screenX, y: screenY }

    setStagePos((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }))
  }, [])

  // End pan
  const endPan = useCallback(() => {
    lastPanPosRef.current = null
    setIsPanning(false)
  }, [])

  return {
    stageScale,
    stagePos,
    isPanning,
    handleWheel,
    handleFitToWindow,
    handleResetCenter,
    handleZoomIn,
    handleZoomOut,
    startPan,
    updatePan,
    endPan,
  }
}
