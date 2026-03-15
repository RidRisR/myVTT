import { Swords, ClipboardList, ChevronRight } from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import type { GmSidebarTab } from '../stores/uiStore'
import { EncounterPanel } from './EncounterPanel'
import { EntityPanel } from './EntityPanel'

const TABS: { id: GmSidebarTab; icon: typeof Swords; label: string }[] = [
  { id: 'archives', icon: Swords, label: '遭遇' },
  { id: 'entities', icon: ClipboardList, label: '实体' },
]

export function GmSidebar() {
  const activeTab = useUiStore((s) => s.gmSidebarTab)
  const collapsed = useUiStore((s) => s.gmSidebarCollapsed)
  const setTab = useUiStore((s) => s.setGmSidebarTab)
  const setCollapsed = useUiStore((s) => s.setGmSidebarCollapsed)

  return (
    <div
      className="fixed top-1/2 left-0 -translate-y-1/2 z-ui flex pointer-events-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex pointer-events-auto"
        style={{
          transform: collapsed ? 'translateX(-244px)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Content area */}
        <div className="w-[244px] h-[480px] bg-glass backdrop-blur-[16px] border border-border-glass border-l-0 rounded-r-none font-sans text-text-primary flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border-glass shrink-0">
            <span className="text-sm font-semibold text-text-primary">
              {TABS.find((t) => t.id === activeTab)?.label}
            </span>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'archives' && <EncounterPanel />}
            {activeTab === 'entities' && <EntityPanel />}
          </div>
        </div>

        {/* Icon tab bar */}
        <div className="w-9 bg-glass backdrop-blur-[12px] rounded-r-[10px] border border-border-glass border-l-0 shadow-[4px_0_16px_rgba(0,0,0,0.2)] flex flex-col items-center py-3 gap-1 -ml-px">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (isActive && !collapsed) {
                    setCollapsed(true)
                  } else {
                    setTab(tab.id)
                    setCollapsed(false)
                  }
                }}
                className={`relative w-8 h-8 flex items-center justify-center rounded-md cursor-pointer transition-colors duration-fast ${
                  isActive && !collapsed
                    ? 'text-accent bg-surface/60'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                aria-label={tab.label}
                title={tab.label}
              >
                {isActive && !collapsed && (
                  <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />
                )}
                <Icon size={16} strokeWidth={1.5} />
              </button>
            )
          })}

          {/* Collapse/expand toggle */}
          <div className="mt-auto">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-8 h-8 flex items-center justify-center text-text-muted/40 hover:text-text-muted cursor-pointer transition-colors duration-fast"
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              <ChevronRight
                size={12}
                strokeWidth={2}
                className="transition-transform duration-300"
                style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
