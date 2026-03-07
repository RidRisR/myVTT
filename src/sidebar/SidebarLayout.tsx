import { type ReactNode } from 'react'
import { useValue } from 'tldraw'
import { SidebarPanel } from './SidebarPanel'
import { SidebarIconBar, type PanelId } from './SidebarIconBar'
import { activePanel as activePanelAtom } from '../roleState'

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
  const currentPanel = useValue(activePanelAtom)

  const togglePanel = (id: PanelId) => {
    activePanelAtom.set(activePanelAtom.get() === id ? null : id)
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
        {children}
        {/* Panel overlays canvas area only */}
        <SidebarPanel
          isOpen={currentPanel !== null}
          title={currentPanel ? panelTitles[currentPanel] : ''}
          onClose={() => activePanelAtom.set(null)}
        >
          {currentPanel && panelContents[currentPanel]}
        </SidebarPanel>
      </div>

      {/* Icon bar */}
      <SidebarIconBar activePanel={currentPanel} onToggle={togglePanel} />
    </div>
  )
}

export type { PanelId }
