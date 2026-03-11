import { Group, Circle } from 'react-konva'

interface GhostTokenProps {
  x: number
  y: number
  pixelSize: number
  color: string
}

export function GhostToken({ x, y, pixelSize, color }: GhostTokenProps) {
  const radius = pixelSize / 2

  return (
    <Group x={x} y={y} listening={false}>
      {/* Semi-transparent fill */}
      <Circle x={radius} y={radius} radius={radius} fill={color} opacity={0.3} />
      {/* Dashed border ring */}
      <Circle
        x={radius}
        y={radius}
        radius={radius}
        stroke={color}
        strokeWidth={2}
        dash={[6, 4]}
        opacity={0.6}
      />
    </Group>
  )
}
