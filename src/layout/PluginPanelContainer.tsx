// src/layout/PluginPanelContainer.tsx
import { createPortal } from 'react-dom'
import type { Entity } from '../shared/entityTypes'
import type { PluginPanelDef } from '../rules/types'
import { useUiStore } from '../stores/uiStore'
import { useRulePlugin } from '../rules/useRulePlugin'
import { useWorldStore } from '../stores/worldStore'

const EMPTY_PANELS: PluginPanelDef[] = []

export function PluginPanelContainer() {
  const activePanels = useUiStore((s) => s.activePluginPanels)
  const closePluginPanel = useUiStore((s) => s.closePluginPanel)
  const plugin = useRulePlugin()
  const entities = useWorldStore((s) => s.entities)
  const updateEntity = useWorldStore((s) => s.updateEntity)

  const panelDefs = plugin.surfaces?.panels ?? EMPTY_PANELS

  // onCreateEntity is used by preset-import features (e.g. DHLibraryTab) — not yet implemented.
  // Portal layer does not own entity construction logic; stub satisfies the PluginPanelProps contract.
  const handleCreateEntity = (_data: Partial<Entity>): void => {}

  if (activePanels.length === 0) return null

  return createPortal(
    <>
      {activePanels.map((activePanel) => {
        const def = panelDefs.find((p) => p.id === activePanel.panelId)
        if (!def) return null

        const entity = activePanel.entityId ? entities[activePanel.entityId] : undefined
        const Component = def.component
        const onClose = () => closePluginPanel(activePanel.panelId)

        if (def.placement === 'fullscreen-overlay') {
          return (
            <div
              key={activePanel.panelId}
              className="fixed inset-0 z-modal flex items-start justify-center overflow-y-auto"
            >
              {/* Backdrop */}
              <div className="fixed inset-0 bg-black/70" onClick={onClose} />
              {/* Panel */}
              <div className="relative z-[1] w-full max-w-3xl my-8 mx-4">
                <Component
                  entity={entity}
                  onClose={onClose}
                  onUpdateEntity={updateEntity}
                  onCreateEntity={handleCreateEntity}
                />
              </div>
            </div>
          )
        }

        // floating placement
        return (
          <div
            key={activePanel.panelId}
            className="fixed inset-0 z-overlay flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto">
              <Component
                entity={entity}
                onClose={onClose}
                onUpdateEntity={updateEntity}
                onCreateEntity={handleCreateEntity}
              />
            </div>
          </div>
        )
      })}
    </>,
    document.body,
  )
}
