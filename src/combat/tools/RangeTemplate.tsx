import { useState, useEffect, useRef } from 'react'
import { Layer, Circle, Wedge, Rect, Line, Text, Group, Rect as BgRect } from 'react-konva'
import type Konva from 'konva'
import type { TacticalInfo } from '../../stores/worldStore'
import type { ToolLayerProps } from './types'

interface Point {
  x: number
  y: number
}

interface RangeShape {
  mode: 'circle' | 'cone' | 'rect'
  origin: Point
  end: Point
  label: string
}

const RANGE_FILL = 'rgba(212, 160, 85, 0.15)'
const RANGE_STROKE = '#D4A055'
const RANGE_DASH = [6, 3]
const CONE_ANGLE = 90
const LABEL_FONT_SIZE = 12
const LABEL_PADDING = 3
const LABEL_BG_COLOR = 'rgba(20, 15, 12, 0.88)'

function calcLabel(mode: string, origin: Point, end: Point, tacticalInfo: TacticalInfo): string {
  const dx = end.x - origin.x
  const dy = end.y - origin.y
  const pixelDist = Math.sqrt(dx * dx + dy * dy)

  const inCells = tacticalInfo.grid.snap && tacticalInfo.grid.size > 0

  if (mode === 'circle') {
    const radius = inCells ? Math.round(pixelDist / tacticalInfo.grid.size) : Math.round(pixelDist)
    const unit = inCells ? 'cell' : 'px'
    return `r=${radius} ${unit}${radius !== 1 && inCells ? 's' : ''}`
  }
  if (mode === 'cone') {
    const length = inCells ? Math.round(pixelDist / tacticalInfo.grid.size) : Math.round(pixelDist)
    const unit = inCells ? 'cell' : 'px'
    return `${length} ${unit}${length !== 1 && inCells ? 's' : ''}`
  }
  if (mode === 'rect') {
    const w = Math.abs(dx)
    const h = Math.abs(dy)
    if (inCells) {
      const cw = Math.round(w / tacticalInfo.grid.size)
      const ch = Math.round(h / tacticalInfo.grid.size)
      return `${cw}x${ch} cells`
    }
    return `${Math.round(w)}x${Math.round(h)} px`
  }
  return ''
}

interface RangeTemplateCanvasProps extends ToolLayerProps {
  mode: 'circle' | 'cone' | 'rect'
}

/** Internal canvas layer for range templates. Receives mode directly. */
function RangeTemplateCanvas({
  mode,
  tacticalInfo,
  stageRef,
  onComplete,
}: RangeTemplateCanvasProps) {
  const [drawing, setDrawing] = useState<{ origin: Point; end: Point } | null>(null)
  const [persisted, setPersisted] = useState<RangeShape[]>([])
  const isDrawingRef = useRef(false)
  const shiftRef = useRef(false)

  // Track Shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true
      if (e.key === 'Escape') {
        setPersisted([])
        setDrawing(null)
        isDrawingRef.current = false
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Attach Stage mouse event handlers
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const getMapPos = (): Point | null => {
      const pos = stage.getRelativePointerPosition()
      if (!pos) return null
      return { x: pos.x, y: pos.y }
    }

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 2) {
        setDrawing(null)
        isDrawingRef.current = false
        return
      }
      if (e.evt.button !== 0) return

      const pos = getMapPos()
      if (!pos) return

      isDrawingRef.current = true
      setDrawing({ origin: pos, end: pos })
    }

    const handleMouseMove = () => {
      if (!isDrawingRef.current) return
      const pos = getMapPos()
      if (!pos) return

      setDrawing((prev) => (prev ? { ...prev, end: pos } : null))
    }

    const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isDrawingRef.current) return
      if (e.evt.button !== 0) return
      isDrawingRef.current = false

      setDrawing((prev) => {
        if (!prev) return null
        if (shiftRef.current) {
          // Persist the shape (Shift held — do NOT call onComplete)
          const label = calcLabel(mode, prev.origin, prev.end, tacticalInfo)
          setPersisted((arr) => [...arr, { mode, origin: prev.origin, end: prev.end, label }])
        } else {
          // Shape complete without Shift — signal one-shot completion
          onComplete?.()
        }
        return null
      })
    }

    stage.on('mousedown.range', handleMouseDown)
    stage.on('mousemove.range', handleMouseMove)
    stage.on('mouseup.range', handleMouseUp)

    return () => {
      stage.off('mousedown.range')
      stage.off('mousemove.range')
      stage.off('mouseup.range')
    }
  }, [mode, tacticalInfo, stageRef, onComplete])

  return (
    <Layer listening={false}>
      {/* Persisted range shapes */}
      {persisted.map((shape, i) => (
        <RangeShapeRenderer key={i} shape={shape} />
      ))}

      {/* Active drawing */}
      {drawing && (
        <RangeShapeRenderer
          shape={{
            mode,
            origin: drawing.origin,
            end: drawing.end,
            label: calcLabel(mode, drawing.origin, drawing.end, tacticalInfo),
          }}
        />
      )}
    </Layer>
  )
}

// ── Wrapper components for each range mode ──

export function RangeCircleCanvas(props: ToolLayerProps) {
  return <RangeTemplateCanvas mode="circle" {...props} />
}

export function RangeConeCanvas(props: ToolLayerProps) {
  return <RangeTemplateCanvas mode="cone" {...props} />
}

export function RangeRectCanvas(props: ToolLayerProps) {
  return <RangeTemplateCanvas mode="rect" {...props} />
}

// ── Shape Renderer ──

function RangeShapeRenderer({ shape }: { shape: RangeShape }) {
  const { mode, origin, end, label } = shape

  if (mode === 'circle') {
    const dx = end.x - origin.x
    const dy = end.y - origin.y
    const radius = Math.sqrt(dx * dx + dy * dy)

    return (
      <>
        <Circle
          x={origin.x}
          y={origin.y}
          radius={radius}
          fill={RANGE_FILL}
          stroke={RANGE_STROKE}
          strokeWidth={1.5}
          dash={RANGE_DASH}
        />
        {/* Radius line */}
        <Line
          points={[origin.x, origin.y, end.x, end.y]}
          stroke={RANGE_STROKE}
          strokeWidth={1}
          dash={RANGE_DASH}
          opacity={0.6}
        />
        <ShapeLabel x={end.x} y={end.y - 20} text={label} />
      </>
    )
  }

  if (mode === 'cone') {
    const dx = end.x - origin.x
    const dy = end.y - origin.y
    const radius = Math.sqrt(dx * dx + dy * dy)
    // Konva Wedge rotation: 0 = right, goes clockwise. atan2 gives angle from positive X axis.
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI

    return (
      <>
        <Wedge
          x={origin.x}
          y={origin.y}
          radius={radius}
          angle={CONE_ANGLE}
          rotation={angleDeg - CONE_ANGLE / 2}
          fill={RANGE_FILL}
          stroke={RANGE_STROKE}
          strokeWidth={1.5}
          dash={RANGE_DASH}
        />
        {/* Direction line */}
        <Line
          points={[origin.x, origin.y, end.x, end.y]}
          stroke={RANGE_STROKE}
          strokeWidth={1}
          dash={RANGE_DASH}
          opacity={0.6}
        />
        <ShapeLabel x={end.x} y={end.y - 20} text={label} />
      </>
    )
  }

  // mode is 'rect' at this point (circle and cone handled above)
  const x = Math.min(origin.x, end.x)
  const y = Math.min(origin.y, end.y)
  const w = Math.abs(end.x - origin.x)
  const h = Math.abs(end.y - origin.y)

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={RANGE_FILL}
        stroke={RANGE_STROKE}
        strokeWidth={1.5}
        dash={RANGE_DASH}
      />
      <ShapeLabel x={x + w / 2} y={y - 20} text={label} />
    </>
  )
}

// ── Shape Label ──

function ShapeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const textWidth = text.length * (LABEL_FONT_SIZE * 0.6) + LABEL_PADDING * 2
  const textHeight = LABEL_FONT_SIZE + LABEL_PADDING * 2

  return (
    <Group x={x - textWidth / 2} y={y - textHeight / 2}>
      <BgRect width={textWidth} height={textHeight} fill={LABEL_BG_COLOR} cornerRadius={3} />
      <Text
        text={text}
        fontSize={LABEL_FONT_SIZE}
        fill={RANGE_STROKE}
        width={textWidth}
        height={textHeight}
        align="center"
        verticalAlign="middle"
        fontFamily="sans-serif"
      />
    </Group>
  )
}
