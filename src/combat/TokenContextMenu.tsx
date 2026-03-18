import type { MapToken, Entity } from '../shared/entityTypes'

interface TokenContextMenuProps {
  tokenId: string | null
  token: MapToken | null
  entity: Entity | null
  role: 'GM' | 'PL'
  onClose: () => void
  onDeleteToken: (id: string) => void
  onUpdateToken: (id: string, updates: Partial<MapToken>) => void
  onUpdateEntity?: (id: string, updates: Partial<Entity>) => void
  onCreateToken: (x: number, y: number) => void
  onCopyToken: (tokenId: string) => void
  mapX: number
  mapY: number
}

const SIZE_OPTIONS = [1, 2, 3, 4] as const

/**
 * Token context menu content — positioning and dismiss logic
 * are handled by the parent RadixContextMenu wrapper.
 */
export function TokenContextMenu({
  tokenId,
  token,
  entity,
  role,
  onClose,
  onDeleteToken,
  onUpdateToken,
  onUpdateEntity,
  onCreateToken,
  onCopyToken,
  mapX,
  mapY,
}: TokenContextMenuProps) {
  // PL: don't show context menu
  if (role !== 'GM') return null

  const isTokenMenu = tokenId !== null && token !== null
  const isHidden = token ? (entity?.permissions.default ?? 'observer') === 'none' : false
  const currentSize = token?.width ?? 1
  const tokenName = entity?.name ?? 'Token'

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      {isTokenMenu ? (
        <>
          {/* Header: token name */}
          <div
            className="px-3 py-1.5 text-text-muted text-xs font-medium border-b border-border-glass mb-1"
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {tokenName}
          </div>

          {/* Copy Token */}
          <MenuItem
            label="Copy Token"
            onClick={() => {
              onCopyToken(token.id)
              onClose()
            }}
          />

          {/* Separator */}
          <div className="border-t border-border-glass my-1" />

          {/* Size submenu — radio style */}
          <div className="px-3 py-1 text-text-muted" style={{ fontSize: 10, fontWeight: 600 }}>
            Size
          </div>
          <div className="flex gap-1 px-3 py-1">
            {SIZE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  onUpdateToken(tokenId, { width: s, height: s })
                  onClose()
                }}
                className="border-none cursor-pointer rounded text-xs font-bold transition-colors duration-100"
                style={{
                  width: 28,
                  height: 24,
                  background: s === currentSize ? 'rgba(212,160,85,0.3)' : 'transparent',
                  color: s === currentSize ? '#D4A055' : '#F0E6D8',
                  border:
                    s === currentSize ? '1px solid rgba(212,160,85,0.5)' : '1px solid transparent',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div className="border-t border-border-glass my-1" />

          {/* Visibility toggle — updates entity permissions since visibility lives on Entity */}
          <MenuItem
            label={isHidden ? 'Show Token' : 'Hide Token'}
            onClick={() => {
              if (entity && onUpdateEntity) {
                const newDefault = isHidden ? 'observer' : 'none'
                onUpdateEntity(entity.id, {
                  permissions: { ...entity.permissions, default: newDefault },
                })
              }
              onClose()
            }}
          />

          {/* Separator */}
          <div className="border-t border-border-glass my-1" />

          {/* Delete Token */}
          <MenuItem
            label="Delete Token"
            danger
            onClick={() => {
              onDeleteToken(tokenId)
              onClose()
            }}
          />
        </>
      ) : (
        /* Empty space menu */
        <MenuItem
          label="Create Token"
          onClick={() => {
            onCreateToken(mapX, mapY)
            onClose()
          }}
        />
      )}
    </div>
  )
}

// ── MenuItem helper ──

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-1.5 bg-transparent border-none text-xs font-medium text-left font-sans transition-colors duration-100 cursor-pointer hover:bg-hover"
      style={{
        color: danger ? '#C04040' : '#F0E6D8',
      }}
    >
      {label}
    </button>
  )
}
