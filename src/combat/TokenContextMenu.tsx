import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { MapToken, Entity } from '../shared/entityTypes'
import { useClickOutside } from '../hooks/useClickOutside'

interface TokenContextMenuProps {
  x: number
  y: number
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

export function TokenContextMenu({
  x,
  y,
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
  const { t } = useTranslation('combat')
  const ref = useRef<HTMLDivElement>(null)

  // Click-outside-to-close (Radix Portal-aware)
  useClickOutside(ref, onClose)

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // PL: don't show context menu
  if (role !== 'GM') return null

  const isTokenMenu = tokenId !== null && token !== null
  const isHidden = token ? (entity?.permissions.default ?? 'observer') === 'none' : false
  const currentSize = token?.width ?? 1
  const tokenName = entity?.name ?? 'Token'

  return (
    <div
      ref={ref}
      className="fixed z-popover bg-glass backdrop-blur-[12px] rounded-lg border border-border-glass shadow-[0_4px_24px_rgba(0,0,0,0.5)] py-1 min-w-[160px] font-sans"
      style={{ left: x, top: y }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      {isTokenMenu ? (
        <>
          {/* Header: token name */}
          <div className="px-3 py-1.5 text-text-muted text-xs font-medium border-b border-border-glass mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
            {tokenName}
          </div>

          {/* Copy Token */}
          <MenuItem
            label={t('token.copy')}
            onClick={() => {
              onCopyToken(token.id)
              onClose()
            }}
          />

          {/* Separator */}
          <div className="border-t border-border-glass my-1" />

          {/* Size submenu — radio style */}
          <div className="px-3 py-1 text-text-muted text-[10px] font-semibold">
            {t('token.size')}
          </div>
          <div className="flex gap-1 px-3 py-1">
            {SIZE_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  onUpdateToken(tokenId, { width: s, height: s })
                  onClose()
                }}
                className={`w-7 h-6 border cursor-pointer rounded text-xs font-bold transition-colors duration-100 ${
                  s === currentSize
                    ? 'bg-accent/30 text-accent border-accent/50'
                    : 'bg-transparent text-text-primary border-transparent'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div className="border-t border-border-glass my-1" />

          {/* Visibility toggle — updates entity permissions since visibility lives on Entity */}
          <MenuItem
            label={isHidden ? t('token.show') : t('token.hide')}
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
            label={t('token.delete')}
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
          label={t('token.create')}
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
      onClick={onClick}
      className={`block w-full px-3 py-1.5 bg-transparent border-none text-xs font-medium text-left font-sans transition-colors duration-100 cursor-pointer hover:bg-hover ${
        danger ? 'text-danger' : 'text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}
