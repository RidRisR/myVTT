import { useState, type ReactNode } from 'react'
import { SidebarPanel } from './SidebarPanel'
import { SidebarIconBar, type PanelId } from './SidebarIconBar'

interface SidebarLayoutProps {
  children: ReactNode
  panelContents: Partial<Record<PanelId, ReactNode>>
}

const panelTitles: Record<PanelId, string> = {
  players: 'Players',
  dice: 'Dice Roller',
  token: 'Token',
}

export function SidebarLayout({ children, panelContents }: SidebarLayoutProps) {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null)

  const togglePanel = (id: PanelId) => {
    setActivePanel((prev) => (prev === id ? null : id))
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
        {children}
      </div>

      {/* Panel content area */}
      <SidebarPanel
        isOpen={activePanel !== null}
        title={activePanel ? panelTitles[activePanel] : ''}
        onClose={() => setActivePanel(null)}
      >
        {activePanel && panelContents[activePanel]}
      </SidebarPanel>

      {/* Icon bar */}
      <SidebarIconBar activePanel={activePanel} onToggle={togglePanel} />
    </div>
  )
}

export type { PanelId }
