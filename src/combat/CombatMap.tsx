import type { Scene } from '../yjs/useScenes'
import { isVideoUrl } from '../shared/assetUpload'

interface CombatMapProps {
  scene: Scene
  children?: React.ReactNode
}

export function CombatMap({ scene, children }: CombatMapProps) {
  const { width, height, imageUrl, gridSize, gridVisible, gridColor, gridOffsetX, gridOffsetY } = scene

  // Generate grid lines
  const vLines: number[] = []
  const hLines: number[] = []
  if (gridVisible && gridSize > 0) {
    for (let x = gridOffsetX; x <= width; x += gridSize) vLines.push(x)
    for (let y = gridOffsetY; y <= height; y += gridSize) hLines.push(y)
  }

  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Scene background */}
      {isVideoUrl(imageUrl) ? (
        <video
          src={imageUrl}
          muted
          loop
          autoPlay
          playsInline
          style={{
            width, height,
            display: 'block',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
        />
      ) : (
        <img
          src={imageUrl}
          alt={scene.name}
          style={{
            width, height,
            display: 'block',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
        />
      )}

      {/* Grid overlay */}
      {gridVisible && gridSize > 0 && (
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          {vLines.map(x => (
            <line key={`v${x}`} x1={x} y1={0} x2={x} y2={height}
              stroke={gridColor} strokeWidth={1} opacity={0.4} />
          ))}
          {hLines.map(y => (
            <line key={`h${y}`} x1={0} y1={y} x2={width} y2={y}
              stroke={gridColor} strokeWidth={1} opacity={0.4} />
          ))}
        </svg>
      )}

      {/* Token layer rendered as children */}
      {children}
    </div>
  )
}
