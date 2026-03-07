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

  const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
  const singleShape = selectedShapes.length === 1 ? selectedShapes[0] : null
  const role = useValue(currentRole)
  const isGM = role === 'GM'
  const isGmOnly = singleShape?.meta?.gmOnly === true

  const handleToggleVisibility = () => {
    if (!singleShape) return
    editor.updateShape({
      id: singleShape.id,
      type: singleShape.type,
      meta: { ...singleShape.meta, gmOnly: !isGmOnly },
    })
  }

  return (
    <DefaultContextMenu {...props}>
      <DefaultContextMenuContent />
      {singleShape && isGM && (
        <TldrawUiMenuGroup id="token-actions">
          <TldrawUiMenuItem
            id="toggle-visibility"
            label={isGmOnly ? 'Show to Players' : 'Hide from Players'}
            onSelect={handleToggleVisibility}
          />
        </TldrawUiMenuGroup>
      )}
    </DefaultContextMenu>
  )
}
