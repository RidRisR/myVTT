import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Entity } from '../shared/entityTypes'
import { getName, getColor, getImageUrl, getNotes } from '../shared/coreComponents'
import { getPortraitResources, getFormulaTokens, getStatuses } from '../log/entityBindings'
import { statusColor } from '../shared/tokenUtils'

interface CharacterDetailPanelProps {
  character: Entity
  isOnline: boolean
  onClose: () => void
}

export function CharacterDetailPanel({ character, isOnline, onClose }: CharacterDetailPanelProps) {
  const { t } = useTranslation('layout')
  const resources = getPortraitResources(character)
  const attributes = getFormulaTokens(character)
  const statuses = getStatuses(character)
  const notes = getNotes(character).text
  const rd = character.components
  const handouts =
    (rd['core:handouts'] as
      | { id: string; title?: string; description?: string; imageUrl?: string }[]
      | undefined) ?? []

  const attrEntries = Object.entries(attributes)

  const hasContent =
    resources.length > 0 ||
    attrEntries.length > 0 ||
    statuses.length > 0 ||
    notes ||
    handouts.length > 0

  const name = getName(character)
  const imageUrl = getImageUrl(character)
  const color = getColor(character)

  return (
    <div
      className="bg-glass backdrop-blur-[16px] rounded-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-border-glass font-sans text-text-primary animate-fade-in"
      style={{
        width: 260,
        padding: '20px 16px',
        maxHeight: 'inherit',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onWheel={(e) => {
        e.stopPropagation()
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2.5 right-2.5 bg-transparent border-none cursor-pointer text-text-muted/35 p-1 flex rounded transition-colors duration-fast hover:text-text-muted/70"
      >
        <X size={14} strokeWidth={1.5} />
      </button>

      {/* Portrait */}
      <div className="flex flex-col items-center mb-4">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-20 h-20 rounded-full object-cover block"
            style={{
              border: `3px solid ${color}`,
              boxShadow: `0 0 20px ${color}33`,
            }}
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-[32px] font-bold"
            style={{
              background: `linear-gradient(135deg, ${color}, ${color}99)`,
              boxShadow: `0 0 20px ${color}33`,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name + Online */}
      <div className="text-center mb-5">
        <div className="font-bold text-lg text-white flex items-center justify-center gap-2 tracking-wide">
          {name}
          {isOnline && (
            <span className="inline-flex items-center gap-1 text-[10px] text-success font-medium tracking-normal">
              <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
              {t('online', { ns: 'common' })}
            </span>
          )}
        </div>
      </div>

      {hasContent && <div className="h-px bg-border-glass -mx-4 mb-4" />}

      {/* Resources (read-only bars) */}
      {resources.length > 0 && (
        <div className="mb-3.5">
          <div className="text-[10px] text-text-muted/40 font-semibold mb-2 uppercase tracking-wider">
            {t('character.resources')}
          </div>
          {resources.map((res, i) => {
            const pct = res.max > 0 ? Math.min(res.current / res.max, 1) : 0
            return (
              <div key={i} className="mb-1.5">
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-text-muted/50 font-semibold">
                    {res.label || t('character.unnamed_resource')}
                  </span>
                  <span className="text-white font-bold text-[10px]">
                    {res.current}/{res.max}
                  </span>
                </div>
                <div className="h-2.5 rounded-[5px] bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-[5px] transition-[width] duration-300 ease-out"
                    style={{
                      width: `${pct * 100}%`,
                      background: `linear-gradient(90deg, ${res.color}, ${res.color}cc)`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Attributes (read-only values) */}
      {attrEntries.length > 0 && (
        <div className="mb-3.5">
          <div className="text-[10px] text-text-muted/40 font-semibold mb-2 uppercase tracking-wider">
            {t('character.attributes')}
          </div>
          {attrEntries.map(([key, value], i) => (
            <div
              key={i}
              className={`flex justify-between items-center px-2 py-[5px] rounded-md text-xs ${
                i % 2 === 0 ? 'bg-surface/30' : 'bg-transparent'
              }`}
            >
              <span className="text-text-muted/50 font-semibold">
                {key || t('character.unnamed_attribute')}
              </span>
              <span className="text-white font-bold">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Statuses (read-only chips) */}
      {statuses.length > 0 && (
        <div className="mb-3.5">
          <div className="text-[10px] text-text-muted/40 font-semibold mb-2 uppercase tracking-wider">
            {t('character.statuses')}
          </div>
          <div className="flex flex-wrap gap-[5px]">
            {statuses.map((s, i) => {
              const sc = statusColor(s.label)
              return (
                <span
                  key={i}
                  className="px-2.5 py-[3px] rounded-xl text-[11px] font-semibold"
                  style={{
                    background: `${sc}22`,
                    color: sc,
                    border: `1px solid ${sc}33`,
                  }}
                >
                  {s.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Notes (read-only text) */}
      {notes && (
        <div className="mb-3.5">
          <div className="text-[10px] text-text-muted/40 font-semibold mb-2 uppercase tracking-wider">
            {t('character.notes')}
          </div>
          <div className="text-xs text-text-muted/70 leading-normal px-2 py-1.5 rounded-md bg-surface/30 whitespace-pre-wrap">
            {notes}
          </div>
        </div>
      )}

      {/* Handouts (read-only cards) */}
      {handouts.length > 0 && (
        <div>
          <div className="text-[10px] text-text-muted/40 font-semibold mb-2 uppercase tracking-wider">
            {t('character.handouts')}
          </div>
          {handouts.map((h) => (
            <div
              key={h.id}
              className="mb-1.5 px-2.5 py-2 rounded-lg bg-surface/40 border border-border-glass"
            >
              <div className="flex items-center gap-2">
                {h.imageUrl && (
                  <img src={h.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                    {h.title || t('character.untitled_handout')}
                  </div>
                  {h.description && (
                    <div
                      className="text-[11px] text-text-muted/45 mt-0.5 leading-tight overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {h.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
