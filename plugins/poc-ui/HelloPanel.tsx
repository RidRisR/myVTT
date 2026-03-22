import type { ComponentProps } from '../../src/ui-system/types'

export function HelloPanel({ sdk }: ComponentProps) {
  const entities = sdk.data.entities()
  return (
    <div style={{ padding: 12, color: '#e2e8f0', fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Hello from poc-ui</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
        Entities:{' '}
        {entities.length === 0 ? '(none — mock data)' : entities.map((e) => e.name).join(', ')}
      </div>
      <button
        style={{ marginTop: 8, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
        onClick={() => {
          alert('sdk.workflow is wired')
        }}
      >
        Ping workflow
      </button>
    </div>
  )
}
