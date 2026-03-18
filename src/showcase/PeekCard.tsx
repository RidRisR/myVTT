import { useTranslation } from 'react-i18next'
import type { ShowcaseItem } from '../shared/showcaseTypes'

interface PeekCardProps {
  item: ShowcaseItem
  onClick: () => void
}

export function PeekCard({ item, onClick }: PeekCardProps) {
  const { t } = useTranslation('showcase')
  if (item.type === 'text') {
    return (
      <div
        onClick={onClick}
        className="cursor-pointer px-4 py-2 max-w-[320px] italic text-[13px] text-text-muted/70 whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      >
        {item.text}
      </div>
    )
  }

  // image / handout
  return (
    <div
      onClick={onClick}
      className="cursor-pointer flex items-center gap-2.5 px-3.5 py-1.5 bg-glass rounded-[10px] border border-border-glass"
    >
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" className="w-11 h-11 object-cover rounded-md shrink-0" />
      )}
      <div className="overflow-hidden">
        <div className="text-[13px] font-medium text-text-primary/80 font-sans whitespace-nowrap overflow-hidden text-ellipsis">
          {item.title || t('untitled')}
        </div>
        <div className="text-[11px] text-text-muted/35 font-sans flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: item.senderColor }}
          />
          {item.senderName}
        </div>
      </div>
    </div>
  )
}
