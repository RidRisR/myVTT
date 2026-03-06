import { Tldraw, type TLShape } from 'tldraw'
import 'tldraw/tldraw.css'
import { useYjsStore } from './useYjsStore'
import { PropertyContextMenu } from './PropertyContextMenu'
import { PropertyOverlay } from './PropertyOverlay'
import { RoleSwitcher } from './RoleSwitcher'
import { DiceSidebar } from './DiceSidebar'
import { currentRole } from './roleState'

function getShapeVisibility(shape: TLShape) {
  if (shape.meta?.gmOnly && currentRole.get() === 'PL') return 'hidden' as const
  return 'inherit' as const
}

export default function App() {
  const { store, yDoc, isLoading } = useYjsStore()

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#666',
      }}>
        Connecting to server...
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        store={store}
        getShapeVisibility={getShapeVisibility}
        components={{
          ContextMenu: PropertyContextMenu,
          InFrontOfTheCanvas: PropertyOverlay,
        }}
      />
      <RoleSwitcher />
      <DiceSidebar yDoc={yDoc} />
    </div>
  )
}
