import type { ComponentProps } from '../../src/ui-system/types'

export function HelloPanel({ sdk }: ComponentProps) {
  const { layoutMode } = sdk.context
  const entities = sdk.data.entities()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#e2e8f0', fontSize: 13 }}>
      {/* play 模式：自定义把手，只有标题栏可拖，内容区仍可交互 */}
      {layoutMode === 'play' && (
        <div
          onMouseDown={(e) => sdk.layout?.startDrag(e)}
          style={{
            padding: '4px 10px',
            background: 'rgba(99,102,241,0.2)',
            borderBottom: '1px solid rgba(99,102,241,0.3)',
            fontSize: 11,
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          ⠿ Hello Panel
        </div>
      )}
      <div style={{ padding: 12, flex: 1 }}>
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
    </div>
  )
}
