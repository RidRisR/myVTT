import { useState, useEffect, useRef } from 'react'
import { Layer, Line, Rect, Text, Group } from 'react-konva'
import type Konva from 'konva'
import type { Scene } from '../../stores/worldStore'

interface Point {
  x: number
  y: number
}

interface Measurement {
  start: Point
  end: Point
  distance: string
}

interface MeasureToolProps {
  active: boolean
  scene: Scene
  stageRef: React.RefObject<Konva.Stage | null>
}

const MEASURE_COLOR = '#D4A055'
const MEASURE_DASH = [8, 4]
const LABEL_FONT_SIZE = 13
const LABEL_PADDING = 4
const LABEL_BG_COLOR = 'rgba(20, 15, 12, 0.88)'

function calcDistance(start: Point, end: Point, scene: Scene): string {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const pixelDist = Math.sqrt(dx * dx + dy * dy)

  if (scene.gridSnap && scene.gridSize > 0) {
    const cells = Math.round(pixelDist / scene.gridSize)
    return `${cells} cell${cells !== 1 ? 's' : ''}`
  }
  return `${Math.round(pixelDist)} px`
}

export function MeasureTool({ active, scene, stageRef }: MeasureToolProps) {
  const [drawing, setDrawing] = useState<{ start: Point; end: Point } | null>(null)
  const [persisted, setPersisted] = useState<Measurement[]>([])
  const isDrawingRef = useRef(false)
  const shiftRef = useRef(false)

  // Track Shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true
      // Escape clears persisted measurements
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

  // Clear drawing state when tool is deactivated
  useEffect(() => {
    if (!active) {
      setDrawing(null)
      isDrawingRef.current = false
    }
  }, [active])

  // Attach Stage mouse event handlers
  useEffect(() => {
    if (!active) return
    const stage = stageRef.current
    if (!stage) return

    const getMapPos = (): Point | null => {
      const pos = stage.getRelativePointerPosition()
      if (!pos) return null
      return { x: pos.x, y: pos.y }
    }

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Right click cancels
      if (e.evt.button === 2) {
        setDrawing(null)
        isDrawingRef.current = false
        return
      }
      if (e.evt.button !== 0) return

      const pos = getMapPos()
      if (!pos) return

      isDrawingRef.current = true
      setDrawing({ start: pos, end: pos })
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
          // Persist the measurement
          const distance = calcDistance(prev.start, prev.end, scene)
          setPersisted((arr) => [...arr, { start: prev.start, end: prev.end, distance }])
        }
        return null
      })
    }

    stage.on('mousedown.measure', handleMouseDown)
    stage.on('mousemove.measure', handleMouseMove)
    stage.on('mouseup.measure', handleMouseUp)

    return () => {
      stage.off('mousedown.measure')
      stage.off('mousemove.measure')
      stage.off('mouseup.measure')
    }
  }, [active, scene, stageRef])

  // Nothing to render if tool is inactive and no persisted measurements
  if (!active && persisted.length === 0) return null

  const currentDistance = drawing ? calcDistance(drawing.start, drawing.end, scene) : ''

  return (
    <Layer listening={false}>
      {/* Persisted measurements */}
      {persisted.map((m, i) => (
        <MeasurementLine key={i} start={m.start} end={m.end} distance={m.distance} />
      ))}

      {/* Active drawing */}
      {drawing && (
        <MeasurementLine start={drawing.start} end={drawing.end} distance={currentDistance} />
      )}
    </Layer>
  )
}

// ── Measurement Line + Label ──

function MeasurementLine({ start, end, distance }: { start: Point; end: Point; distance: string }) {
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  // Estimate text width for background rect
  const textWidth = distance.length * (LABEL_FONT_SIZE * 0.6) + LABEL_PADDING * 2
  const textHeight = LABEL_FONT_SIZE + LABEL_PADDING * 2

  return (
    <>
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={MEASURE_COLOR}
        strokeWidth={2}
        dash={MEASURE_DASH}
      />
      {/* Small circle at start */}
      <Line
        points={[start.x - 3, start.y, start.x + 3, start.y]}
        stroke={MEASURE_COLOR}
        strokeWidth={2}
      />
      {/* Small circle at end */}
      <Line points={[end.x - 3, end.y, end.x + 3, end.y]} stroke={MEASURE_COLOR} strokeWidth={2} />
      {/* Label background */}
      <Group x={midX - textWidth / 2} y={midY - textHeight / 2}>
        <Rect width={textWidth} height={textHeight} fill={LABEL_BG_COLOR} cornerRadius={3} />
        <Text
          text={distance}
          fontSize={LABEL_FONT_SIZE}
          fill={MEASURE_COLOR}
          width={textWidth}
          height={textHeight}
          align="center"
          verticalAlign="middle"
          fontFamily="sans-serif"
        />
      </Group>
    </>
  )
}
