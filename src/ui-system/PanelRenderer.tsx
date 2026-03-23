import { PanelErrorBoundary } from './PanelErrorBoundary'
import { DragHandle } from './LayoutEditor'
import type { UIRegistry } from './registry'
import type { LayoutConfig, IComponentSDK } from './types'
import { useSessionStore } from '../stores/sessionStore'

interface Props {
  registry: UIRegistry
  layout: LayoutConfig
  makeSDK: (instanceKey: string, instanceProps: Record<string, unknown>) => IComponentSDK
  layoutMode: 'play' | 'edit'
  onDrag?: (instanceKey: string, delta: { dx: number; dy: number }) => void
  showHandles?: boolean
}

export function PanelRenderer({
  registry,
  layout,
  makeSDK,
  layoutMode,
  onDrag,
  showHandles = true,
}: Props) {
  // Select primitive array ref directly — avoid new object to prevent infinite re-render
  const selection = useSessionStore((s) => s.selection)
  const session = { selection }
  const entries = Object.entries(layout)

  return (
    <>
      {entries.map(([instanceKey, entry]) => {
        if (entry.visible === false) return null

        // Parse componentId from "componentId#instance"
        const componentId = instanceKey.replace(/#[^#]*$/, '')
        const def = registry.getComponent(componentId)
        if (!def) return null

        const resolvedProps =
          typeof entry.instanceProps === 'function'
            ? entry.instanceProps(session)
            : (entry.instanceProps ?? {})
        const sdk = makeSDK(instanceKey, resolvedProps)
        const PanelComponent = def.component

        return (
          <div
            key={instanceKey}
            style={{
              position: 'absolute',
              left: entry.x,
              top: entry.y,
              width: entry.width,
              height: entry.height,
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>
              <PanelErrorBoundary panelId={instanceKey}>
                <PanelComponent sdk={sdk} />
              </PanelErrorBoundary>
            </div>
            {layoutMode === 'edit' && onDrag && showHandles ? (
              <DragHandle instanceKey={instanceKey} label={componentId} onDrag={onDrag} />
            ) : null}
          </div>
        )
      })}
    </>
  )
}
