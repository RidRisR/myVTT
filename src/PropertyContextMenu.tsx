import { useState } from 'react'
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'
import { currentRole } from './roleState'

export function PropertyContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()
  const [showDialog, setShowDialog] = useState(false)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')

  const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
  const singleShape = selectedShapes.length === 1 ? selectedShapes[0] : null
  const role = useValue(currentRole)
  const isGM = role === 'GM'
  const hasProperties =
    singleShape?.meta?.properties &&
    (singleShape.meta.properties as { key: string; value: string }[]).length > 0
  const isGmOnly = singleShape?.meta?.gmOnly === true

  const handleAddProperty = (_source: string) => {
    setEditKey('')
    setEditValue('')
    setShowDialog(true)
  }

  const handleSave = () => {
    if (!singleShape || !editKey.trim()) return

    const existing = (singleShape.meta.properties ?? []) as {
      key: string
      value: string
    }[]

    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: {
        ...singleShape.meta,
        properties: [...existing, { key: editKey.trim(), value: editValue.trim() }],
      },
    })

    setShowDialog(false)
  }

  const handleClearProperties = (_source: string) => {
    if (!singleShape) return
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: { ...singleShape.meta, properties: [] },
    })
  }

  const handleToggleVisibility = (_source: string) => {
    if (!singleShape) return
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: { ...singleShape.meta, gmOnly: !isGmOnly },
    })
  }

  return (
    <>
      <DefaultContextMenu {...props}>
        <DefaultContextMenuContent />
        {singleShape && (
          <TldrawUiMenuGroup id="property-actions">
            <TldrawUiMenuItem
              id="add-property"
              label="Add Property"
              onSelect={handleAddProperty}
            />
            {hasProperties && (
              <TldrawUiMenuItem
                id="clear-properties"
                label="Clear All Properties"
                onSelect={handleClearProperties}
              />
            )}
            {isGM && (
              <TldrawUiMenuItem
                id="toggle-visibility"
                label={isGmOnly ? 'Show to Players' : 'Hide from Players'}
                onSelect={handleToggleVisibility}
              />
            )}
          </TldrawUiMenuGroup>
        )}
      </DefaultContextMenu>

      {showDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 99999,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              minWidth: 300,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              fontFamily: 'sans-serif',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Add Property</h3>
            <div style={{ marginBottom: 12 }}>
              <input
                autoFocus
                placeholder="Name (e.g. HP, AC, Class)"
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <input
                placeholder="Value (e.g. 10, 15, Warrior)"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDialog(false)}
                style={{
                  padding: '6px 16px',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editKey.trim()}
                style={{
                  padding: '6px 16px',
                  border: 'none',
                  borderRadius: 6,
                  background: editKey.trim() ? '#2563eb' : '#ccc',
                  color: '#fff',
                  cursor: editKey.trim() ? 'pointer' : 'default',
                  fontSize: 14,
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
