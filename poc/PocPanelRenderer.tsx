import { usePocSessionStore } from './sessionStore'

export interface PanelEntry {
  component: React.ComponentType<Record<string, unknown>>
  instanceProps?: Record<string, unknown> | ((session: { selection: string[] }) => Record<string, unknown>)
}

export function PocPanelRenderer({ entries }: { entries: Record<string, PanelEntry> }) {
  const session = usePocSessionStore()

  return (
    <>
      {Object.entries(entries).map(([key, entry]) => {
        const resolvedProps =
          typeof entry.instanceProps === 'function'
            ? entry.instanceProps(session)
            : (entry.instanceProps ?? {})

        const Component = entry.component
        return <Component key={key} {...resolvedProps} />
      })}
    </>
  )
}
