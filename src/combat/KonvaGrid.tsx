import { Layer, Line } from 'react-konva'

interface KonvaGridProps {
  width: number
  height: number
  gridSize: number
  gridVisible: boolean
  gridColor: string
  gridOffsetX: number
  gridOffsetY: number
}

export function KonvaGrid({
  width,
  height,
  gridSize,
  gridVisible,
  gridColor,
  gridOffsetX,
  gridOffsetY,
}: KonvaGridProps) {
  if (!gridVisible || gridSize <= 0 || !width || !height) return null

  const vLines: number[] = []
  const hLines: number[] = []
  for (let x = gridOffsetX; x <= width; x += gridSize) vLines.push(x)
  for (let y = gridOffsetY; y <= height; y += gridSize) hLines.push(y)

  return (
    <Layer listening={false}>
      {vLines.map((x) => (
        <Line
          key={`v${x}`}
          points={[x, 0, x, height]}
          stroke={gridColor}
          strokeWidth={1}
          opacity={0.4}
        />
      ))}
      {hLines.map((y) => (
        <Line
          key={`h${y}`}
          points={[0, y, width, y]}
          stroke={gridColor}
          strokeWidth={1}
          opacity={0.4}
        />
      ))}
    </Layer>
  )
}
