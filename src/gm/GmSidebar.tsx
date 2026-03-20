import { useTranslation } from 'react-i18next'
import { Swords, ClipboardList, ChevronRight, Image } from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import type { GmSidebarTab } from '../stores/uiStore'
import { ArchivePanel } from './ArchivePanel'
import { EntityPanel } from './EntityPanel'
import { SceneConfigSidebarTab } from './SceneConfigSidebarTab'

const TABS: { id: GmSidebarTab; icon: typeof Swords; label: string }[] = [
  { id: 'scene', icon: Image, label: 'sidebar.scene' },
  { id: 'archives', icon: Swords, label: 'sidebar.archives' },
  { id: 'entities', icon: ClipboardList, label: 'sidebar.entities' },
]

export function GmSidebar() {
  const { t } = useTranslation('gm')
  const activeTab = useUiStore((s) => s.gmSidebarTab)
  const collapsed = useUiStore((s) => s.gmSidebarCollapsed)
  const setTab = useUiStore((s) => s.setGmSidebarTab)
  const setCollapsed = useUiStore((s) => s.setGmSidebarCollapsed)

  return (
    <div
      className="fixed top-1/2 left-0 -translate-y-1/2 z-ui flex pointer-events-none"
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      <div
        className="flex pointer-events-auto"
        style={{
          transform: collapsed ? 'translateX(-300px)' : 'translateX(0)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Content area */}
        <div className="w-[300px] h-[560px] bg-glass backdrop-blur-[16px] border border-border-glass border-l-0 rounded-r-none font-sans text-text-primary flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border-glass shrink-0">
            <span className="text-sm font-semibold text-text-primary" data-testid="sidebar-header">
              {t(TABS.find((tab) => tab.id === activeTab)?.label ?? '')}
            </span>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'scene' && <SceneConfigSidebarTab />}
            {activeTab === 'archives' && <ArchivePanel />}
            {activeTab === 'entities' && <EntityPanel />}
          </div>
        </div>

        {/* Icon tab bar */}
        <div className="w-10 bg-glass backdrop-blur-[12px] rounded-r-[10px] border border-border-glass border-l-0 shadow-[4px_0_16px_rgba(0,0,0,0.2)] flex flex-col items-center py-3 gap-1.5 -ml-px">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                data-testid={`sidebar-tab-${tab.id}`}
                onClick={() => {
                  if (isActive && !collapsed) {
                    setCollapsed(true)
                  } else {
                    setTab(tab.id)
                    setCollapsed(false)
                  }
                }}
                className={`relative w-9 h-9 flex items-center justify-center rounded-md cursor-pointer transition-colors duration-fast ${
                  isActive && !collapsed
                    ? 'text-accent bg-surface/60'
                    : 'text-text-muted hover:text-text-primary'
                }`}
                aria-label={t(tab.label)}
                title={t(tab.label)}
              >
                {isActive && !collapsed && (
                  <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />
                )}
                <Icon size={18} strokeWidth={1.5} />
              </button>
            )
          })}

          {/* Collapse/expand toggle */}
          <div className="mt-auto">
            <button
              onClick={() => {
                setCollapsed(!collapsed)
              }}
              className="w-9 h-9 flex items-center justify-center text-text-muted/40 hover:text-text-muted cursor-pointer transition-colors duration-fast"
              aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
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
