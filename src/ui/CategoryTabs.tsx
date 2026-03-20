import type { ReactNode } from 'react'

interface CategoryTabsProps {
  categories: Array<{ key: string; label: string }>
  active: string
  onSelect: (key: string) => void
  trailing?: ReactNode
}

export function CategoryTabs({ categories, active, onSelect, trailing }: CategoryTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-glass/30 pb-1">
      {categories.map((cat) => (
        <button
          key={cat.key}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            active === cat.key
              ? 'text-text-primary border-b-2 border-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
          onClick={() => {
            onSelect(cat.key)
          }}
        >
          {cat.label}
        </button>
      ))}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}
