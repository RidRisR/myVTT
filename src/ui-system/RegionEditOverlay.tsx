// src/ui-system/RegionEditOverlay.tsx
import { useCallback, useRef } from 'react'
import type { RegionDef } from './registrationTypes'
import type { RegionLayoutEntry, AnchorPoint, Viewport } from './regionTypes'
import { createPointerDragHandler, createPointerResizeHandler } from './usePointerDrag'
import { inferPlacement } from './layoutEngine'

interface Props {
  def: RegionDef
  entry: RegionLayoutEntry
  /** Current pixel position (pre-resolved by RegionRenderer) */
  currentPos?: { x: number; y: number }
  viewport?: Viewport
  onDragEnd?: (
    instanceKey: string,
    placement: { anchor: AnchorPoint; offsetX: number; offsetY: number },
  ) => void
  onResize?: (instanceKey: string, size: { width: number; height: number }) => void
}

export function RegionEditOverlay({
  def,
  entry,
  currentPos,
  viewport,
  onDragEnd,
  onResize,
}: Props) {
  const posRef = useRef(currentPos ?? { x: 0, y: 0 })
  const sizeRef = useRef({ width: entry.width, height: entry.height })

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const parent = (e.currentTarget as HTMLElement).parentElement
      if (!parent) return

      posRef.current = { x: parent.offsetLeft, y: parent.offsetTop }

      createPointerDragHandler(
        (delta) => {
          posRef.current = {
            x: posRef.current.x + delta.dx,
            y: posRef.current.y + delta.dy,
          }
          parent.style.left = `${posRef.current.x}px`
          parent.style.top = `${posRef.current.y}px`
        },
        () => {
          if (onDragEnd && viewport) {
            const placement = inferPlacement(
              {
                x: posRef.current.x,
                y: posRef.current.y,
                width: sizeRef.current.width,
                height: sizeRef.current.height,
              },
              viewport,
            )
            onDragEnd(def.id, placement)
          }
        },
      )(e.nativeEvent)
    },
    [def.id, onDragEnd, viewport],
  )

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const parent = (e.currentTarget as HTMLElement).parentElement
      if (!parent) return
      e.stopPropagation()

      sizeRef.current = { width: entry.width, height: entry.height }
      const minW = def.minSize?.width ?? 50
      const minH = def.minSize?.height ?? 50

      createPointerResizeHandler(
        (delta) => {
          sizeRef.current = {
            width: Math.max(minW, sizeRef.current.width + delta.dw),
            height: Math.max(minH, sizeRef.current.height + delta.dh),
          }
          parent.style.width = `${sizeRef.current.width}px`
          parent.style.height = `${sizeRef.current.height}px`
        },
        () => {
          if (onResize) {
            onResize(def.id, sizeRef.current)
          }
        },
      )(e.nativeEvent)
    },
    [def.id, def.minSize, entry.width, entry.height, onResize],
  )

  return (
    <>
      {/* Drag handle — covers entire region */}
      <div
        data-drag-handle
        title={def.id}
        onPointerDown={handleDragPointerDown}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          cursor: 'move',
          userSelect: 'none',
          border: '1.5px solid rgba(99,102,241,0.55)',
          borderRadius: 2,
        }}
      />
      {/* Resize handle — bottom-right corner */}
      <div
        data-resize-handle
        onPointerDown={handleResizePointerDown}
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: 12,
          height: 12,
          zIndex: 11,
          cursor: 'se-resize',
          background: 'rgba(99,102,241,0.7)',
          borderRadius: 2,
        }}
      />
    </>
  )
}
