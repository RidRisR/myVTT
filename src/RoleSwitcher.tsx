import { useValue } from 'tldraw'
import { currentRole } from './roleState'

export function RoleSwitcher() {
  const role = useValue(currentRole)

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        padding: '6px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontFamily: 'sans-serif',
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span style={{ fontWeight: 600, color: '#333' }}>Role:</span>
      <select
        value={role}
        onChange={(e) => currentRole.set(e.target.value as 'GM' | 'PL')}
        style={{
          padding: '3px 8px',
          borderRadius: 4,
          border: '1px solid #ccc',
          fontSize: 13,
          cursor: 'pointer',
          background: role === 'GM' ? '#fef3c7' : '#dbeafe',
        }}
      >
        <option value="GM">GM</option>
        <option value="PL">PL</option>
      </select>
    </div>
  )
}
