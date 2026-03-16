import { useState, useCallback } from 'react'
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
  handleWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
  handleFitToWindow: () => void
  handleResetCenter: () => void
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
}

export function useCameraControls({
  tacticalInfo,
  containerSize,
}: UseCameraControlsParams): UseCameraControlsReturn {
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })

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

  // Handle stage drag end to update position state
  const handleDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    // Only handle stage-level drags, not token drags
    const stage = e.target.getStage()
    if (e.target !== stage) return
    setStagePos({ x: stage.x(), y: stage.y() })
  }, [])

  return {
    stageScale,
    stagePos,
    handleWheel,
    handleFitToWindow,
    handleResetCenter,
    handleZoomIn,
    handleZoomOut,
    handleDragEnd,
  }
}
