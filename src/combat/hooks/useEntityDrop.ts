import { useCallback } from 'react'
import type { TacticalInfo } from '../../stores/worldStore'
import { snapToGrid } from '../combatUtils'

interface UseEntityDropParams {
  containerRef: React.RefObject<HTMLDivElement | null>
  stagePos: { x: number; y: number }
  stageScale: number
  tacticalInfo: TacticalInfo | null
  onDropEntityOnMap?: (entityId: string, mapX: number, mapY: number) => void
}

interface UseEntityDropReturn {
  handleDragOver: React.DragEventHandler<HTMLDivElement>
  handleDrop: React.DragEventHandler<HTMLDivElement>
}

export function useEntityDrop({
  containerRef,
  stagePos,
  stageScale,
  tacticalInfo,
  onDropEntityOnMap,
}: UseEntityDropParams): UseEntityDropReturn {
  const handleDragOver = useCallback<React.DragEventHandler<HTMLDivElement>>((e) => {
    if (e.dataTransfer.types.includes('application/x-entity-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback<React.DragEventHandler<HTMLDivElement>>(
    (e) => {
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
      if (tacticalInfo?.grid.snap) {
        const snapped = snapToGrid(
          mapX,
          mapY,
          tacticalInfo.grid.size,
          tacticalInfo.grid.offsetX,
          tacticalInfo.grid.offsetY,
        )
        mapX = snapped.x
        mapY = snapped.y
      }

      onDropEntityOnMap(entityId, mapX, mapY)
    },
    [containerRef, stagePos, stageScale, tacticalInfo, onDropEntityOnMap],
  )

  return { handleDragOver, handleDrop }
}
