import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Entity } from '../shared/entityTypes'
import { getName, getColor, getImageUrl } from '../shared/coreComponents'
import { useRulePlugin } from '../rules/useRulePlugin'

interface MyCharacterCardProps {
  entity: Entity
  onUpdateEntity: (id: string, updates: Partial<Entity>) => void
}

export function MyCharacterCard({ entity, onUpdateEntity }: MyCharacterCardProps) {
  const [open, setOpen] = useState(false)
  const plugin = useRulePlugin()
  const Card = plugin.characterUI.EntityCard

  const name = getName(entity)
  const imageUrl = getImageUrl(entity)
  const color = getColor(entity)

  return (
    <div
      className="fixed top-1/2 left-0 -translate-y-1/2 z-ui flex pointer-events-none"
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      <div
        className="flex items-center pointer-events-auto"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-280px)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Card panel -- content delegated to plugin's EntityCard */}
        <div className="w-[272px] bg-glass backdrop-blur-[16px] rounded-r-[14px] shadow-[4px_0_32px_rgba(0,0,0,0.3)] border border-border-glass border-l-0 overflow-y-auto max-h-[80vh]">
          <Card
            entity={entity}
            onUpdate={(patch) => {
              onUpdateEntity(entity.id, patch)
            }}
            readonly={false}
          />
        </div>

        {/* Tab handle -- always visible */}
        <div
          onClick={() => {
            setOpen(!open)
          }}
          className="w-9 py-3 bg-glass backdrop-blur-[12px] rounded-r-[10px] cursor-pointer flex flex-col items-center gap-1.5 border border-border-glass border-l-0 shadow-[4px_0_16px_rgba(0,0,0,0.2)] transition-colors duration-fast -ml-px hover:bg-surface"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
              style={{ border: `2px solid ${color}` }}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold font-sans"
              style={{ background: color }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <ChevronRight
            size={10}
            strokeWidth={2.5}
            className="text-text-muted/40 transition-transform duration-300"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </div>
    </div>
  )
}
