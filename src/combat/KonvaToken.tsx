import { Group, Circle, Image, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { MapToken as MapTokenType, Entity } from '../shared/entityTypes'
import { getEntityResources, getEntityStatuses } from '../shared/entityAdapters'
import { statusColor } from '../shared/tokenUtils'
import { useImage } from './useImage'

interface KonvaTokenProps {
  token: MapTokenType
  entity: Entity | null
  pixelSize: number
  selected: boolean
  isHidden: boolean
  canDrag: boolean
  stageScale: number
  onSelect: (tokenId: string) => void
  onDragStart: (e: Konva.KonvaEventObject<DragEvent>, tokenId: string) => void
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>, tokenId: string) => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>, tokenId: string) => void
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>, tokenId: string) => void
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>, tokenId: string) => void
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>, tokenId: string) => void
}

export function KonvaToken({
  token,
  entity,
  pixelSize,
  selected,
  isHidden,
  canDrag,
  stageScale,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: KonvaTokenProps) {
  const rawColor = entity?.color ?? '#888888'
  // Expand 3-char hex (#abc) to 6-char (#aabbcc) so appending alpha (e.g. 'aa') works
  const color =
    /^#[0-9a-fA-F]{3}$/.test(rawColor)
      ? `#${rawColor[1]}${rawColor[1]}${rawColor[2]}${rawColor[2]}${rawColor[3]}${rawColor[3]}`
      : rawColor
  const imageUrl = entity?.imageUrl ?? ''
  const name = entity?.name ?? ''

  const [img] = useImage(imageUrl || undefined)

  const radius = pixelSize / 2

  // Overlay data
  const resources = getEntityResources(entity)
  const mainResource = resources[0]
  const hasHp = mainResource !== undefined && mainResource.max > 0
  const hpPct = hasHp ? Math.min(mainResource.current / mainResource.max, 1) : 0

  const statuses = getEntityStatuses(entity)

  // Inverse scale factor so overlays stay the same screen size regardless of zoom
  const invScale = stageScale > 0 ? 1 / stageScale : 1

  return (
    <Group
      x={token.x}
      y={token.y}
      draggable={canDrag}
      opacity={isHidden ? 0.5 : 1}
      onClick={(e) => {
        e.cancelBubble = true
        onSelect(token.id)
      }}
      onTap={(e) => {
        e.cancelBubble = true
        onSelect(token.id)
      }}
      onDragStart={(e) => onDragStart(e, token.id)}
      onDragMove={(e) => onDragMove(e, token.id)}
      onDragEnd={(e) => onDragEnd(e, token.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onContextMenu?.(e, token.id)
      }}
      onMouseEnter={(e) => onMouseEnter?.(e, token.id)}
      onMouseLeave={(e) => onMouseLeave?.(e, token.id)}
    >
      {/* Clipped circle for the token visual */}
      <Group
        clipFunc={(ctx) => {
          ctx.arc(radius, radius, radius, 0, Math.PI * 2, false)
        }}
      >
        {img ? (
          <Image image={img} x={0} y={0} width={pixelSize} height={pixelSize} />
        ) : (
          <>
            <Rect
              x={0}
              y={0}
              width={pixelSize}
              height={pixelSize}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: pixelSize, y: pixelSize }}
              fillLinearGradientColorStops={[0, color, 1, `${color}aa`]}
            />
            <Text
              x={0}
              y={0}
              width={pixelSize}
              height={pixelSize}
              text={name.charAt(0).toUpperCase() || '?'}
              fontSize={Math.max(12, pixelSize * 0.3)}
              fontStyle="bold"
              fontFamily="sans-serif"
              fill="#fff"
              align="center"
              verticalAlign="middle"
            />
          </>
        )}
      </Group>

      {/* Selection / border ring */}
      <Circle
        x={radius}
        y={radius}
        radius={radius}
        stroke={selected ? '#fff' : color}
        strokeWidth={3}
        dash={isHidden ? [6, 4] : undefined}
        shadowColor={selected ? color : undefined}
        shadowBlur={selected ? 16 : 0}
        shadowEnabled={selected}
        listening={false}
      />

      {/* Overlay group — scaled inversely so it stays constant screen size */}
      <Group x={radius} y={pixelSize + 2} scaleX={invScale} scaleY={invScale} listening={false}>
        {/* Name label */}
        {name.length > 0 && (
          <Text
            x={-60}
            y={0}
            width={120}
            text={name}
            fontSize={11}
            fontStyle="bold"
            fontFamily="sans-serif"
            fill="#fff"
            align="center"
            shadowColor="rgba(0,0,0,0.8)"
            shadowBlur={3}
            shadowOffset={{ x: 0, y: 1 }}
            shadowEnabled={true}
            ellipsis={true}
            wrap="none"
          />
        )}

        {/* HP bar */}
        {hasHp && (
          <>
            {/* Background */}
            <Rect
              x={-24}
              y={name.length > 0 ? 14 : 0}
              width={48}
              height={5}
              cornerRadius={3}
              fill="rgba(0,0,0,0.5)"
            />
            {/* Fill */}
            <Rect
              x={-24}
              y={name.length > 0 ? 14 : 0}
              width={48 * hpPct}
              height={5}
              cornerRadius={3}
              fill={hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444'}
            />
          </>
        )}

        {/* Status chips */}
        {statuses.length > 0 && (
          <Group y={name.length > 0 ? (hasHp ? 22 : 14) : hasHp ? 8 : 0}>
            {statuses.slice(0, 3).map((s, i) => {
              const sc = statusColor(s.label)
              const chipWidth = Math.min(s.label.length * 5 + 8, 40)
              const totalWidth = statuses
                .slice(0, 3)
                .reduce((sum, st) => sum + Math.min(st.label.length * 5 + 8, 40) + 2, -2)
              const startX = -totalWidth / 2
              let offsetX = startX
              for (let j = 0; j < i; j++) {
                offsetX += Math.min(statuses[j].label.length * 5 + 8, 40) + 2
              }
              return (
                <Group key={i} x={offsetX} y={0}>
                  <Rect
                    x={0}
                    y={0}
                    width={chipWidth}
                    height={12}
                    cornerRadius={4}
                    fill={`${sc}cc`}
                  />
                  <Text
                    x={0}
                    y={0}
                    width={chipWidth}
                    height={12}
                    text={s.label}
                    fontSize={8}
                    fontStyle="bold"
                    fontFamily="sans-serif"
                    fill="#fff"
                    align="center"
                    verticalAlign="middle"
                  />
                </Group>
              )
            })}
            {statuses.length > 3 && (
              <Group
                x={(() => {
                  const totalWidth = statuses
                    .slice(0, 3)
                    .reduce((sum, st) => sum + Math.min(st.label.length * 5 + 8, 40) + 2, -2)
                  return totalWidth / 2 + 4
                })()}
                y={0}
              >
                <Rect
                  x={0}
                  y={0}
                  width={20}
                  height={12}
                  cornerRadius={4}
                  fill="rgba(255,255,255,0.2)"
                />
                <Text
                  x={0}
                  y={0}
                  width={20}
                  height={12}
                  text={`+${statuses.length - 3}`}
                  fontSize={8}
                  fontStyle="bold"
                  fontFamily="sans-serif"
                  fill="#fff"
                  align="center"
                  verticalAlign="middle"
                />
              </Group>
            )}
          </Group>
        )}
      </Group>
    </Group>
  )
}
