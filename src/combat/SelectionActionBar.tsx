import { useMemo } from 'react'
import type { MapToken, Entity } from '../shared/entityTypes'
import type { TokenAction } from '../rules/types'
import { useUiStore } from '../stores/uiStore'
import { getAllRenderers, createRendererPoint } from '../log/rendererRegistry'

const TOKEN_ACTION_POINT = createRendererPoint<TokenAction>('combat', 'token-action')

interface SelectionActionBarProps {
  tokens: MapToken[]
  selectedTokenIds: string[]
  primarySelectedTokenId: string | null
  getEntity: (id: string) => Entity | null
  role: 'GM' | 'PL'
  stageScale: number
  stagePos: { x: number; y: number }
  containerOffset: { x: number; y: number }
  gridSize: number
}

export function SelectionActionBar({
  tokens,
  selectedTokenIds,
  primarySelectedTokenId,
  getEntity,
  role: _role,
  stageScale,
  stagePos,
  containerOffset,
  gridSize,
}: SelectionActionBarProps) {
  const startTargeting = useUiStore((s) => s.startTargeting)

  // Read token actions from RendererRegistry (plugins register via onActivate)
  const actions = useMemo(() => {
    if (selectedTokenIds.length === 0 || !primarySelectedTokenId) return []
    return getAllRenderers(TOKEN_ACTION_POINT)
  }, [selectedTokenIds, primarySelectedTokenId])

  // Don't render if no selected tokens or no actions
  if (selectedTokenIds.length === 0 || !primarySelectedTokenId || actions.length === 0) {
    return null
  }

  // Find the primary token to position the bar
  const primaryToken = tokens.find((t) => t.id === primarySelectedTokenId)
  if (!primaryToken) return null

  const primaryEntity = getEntity(primaryToken.entityId)

  // Compute screen position below the primary token
  const pixelSize = primaryToken.width * gridSize
  const screenX = primaryToken.x * stageScale + stagePos.x + containerOffset.x
  const screenY = primaryToken.y * stageScale + stagePos.y + containerOffset.y
  const barLeft = screenX + (pixelSize * stageScale) / 2
  const barTop = screenY + pixelSize * stageScale + 8

  return (
    <div
      className="fixed z-ui bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] flex items-center gap-1 px-1.5 py-1 pointer-events-auto"
      style={{
        left: barLeft,
        top: barTop,
        transform: 'translateX(-50%)',
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      {actions.map((action) => {
        const Icon = action.icon
        const isDisabled = action.disabled === true

        return (
          <button
            key={action.id}
            title={action.tooltip ?? action.label}
            disabled={isDisabled}
            className={`flex items-center justify-center w-7 h-7 rounded bg-transparent border-none text-text-primary transition-colors duration-100 ${
              isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-hover'
            }`}
            onClick={() => {
              if (isDisabled) return
              if (action.targeting) {
                if (primaryEntity) {
                  startTargeting(action, primaryEntity)
                }
                return
              }
              if (primaryEntity) {
                action.onExecute(primaryEntity, [])
              }
            }}
          >
            {Icon ? <Icon /> : <span className="text-xs font-medium">{action.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
