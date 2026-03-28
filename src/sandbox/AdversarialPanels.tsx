// Adversarial panel components for verifying PanelRenderer isolation guarantees.
// Each panel attempts to break containment in a specific way.
// If isolation is working, none of these should escape their panel boundary.

import type { ComponentProps } from '../ui-system/types'

/** Panel that tries to escape via position: fixed + high zIndex */
export function FixedEscapePanel({ sdk }: ComponentProps) {
  return (
    <div style={{ padding: 8, color: '#e2e8f0', fontSize: 11 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#ef4444' }}>
        Fixed Escape Attempt
      </div>
      {/* This div tries to be position:fixed at viewport top-left.
          contain:paint on the parent should trap it inside the panel. */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 300,
          height: 40,
          background: 'rgba(239,68,68,0.9)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 700,
          zIndex: 99999,
        }}
      >
        BUG: I escaped! (should be trapped)
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
        Red bar should appear INSIDE this panel, not at viewport top.
      </div>
    </div>
  )
}

/** Panel with extremely high zIndex elements trying to cover other panels */
export function ZIndexEscapePanel({ sdk }: ComponentProps) {
  return (
    <div style={{ padding: 8, color: '#e2e8f0', fontSize: 11 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#f59e0b' }}>
        zIndex Escape Attempt
      </div>
      {/* This div tries to use zIndex:999999 to cover everything.
          isolation:isolate on the content wrapper should contain it. */}
      <div
        style={{
          position: 'absolute',
          inset: -50,
          background: 'rgba(245,158,11,0.3)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          border: '3px dashed #f59e0b',
        }}
      >
        BUG: I cover everything! (should be clipped)
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, position: 'relative', zIndex: 1 }}>
        Yellow overlay should be clipped to panel bounds.
      </div>
    </div>
  )
}

/** Panel that tries to steal pointer events via stopPropagation */
export function EventThiefPanel({ sdk }: ComponentProps) {
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      style={{
        padding: 8,
        color: '#e2e8f0',
        fontSize: 11,
        height: '100%',
        cursor: 'not-allowed',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, color: '#8b5cf6' }}>
        Event Thief Panel
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
        This panel calls stopPropagation + preventDefault on all pointer/mouse events.
        In edit mode, DragHandle should still work because content layer has pointerEvents:none.
      </div>
      <button
        onClick={() => {
          // eslint-disable-next-line no-alert
          alert('BUG: event reached panel content in edit mode!')
        }}
        style={{
          marginTop: 8,
          padding: '4px 10px',
          background: '#8b5cf6',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        Click me (should be blocked in edit mode)
      </button>
    </div>
  )
}

/** Panel that crashes during render */
export function CrashPanel(_props: ComponentProps) {
  throw new Error('Intentional crash: panel render failure')
}
