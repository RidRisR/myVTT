import {
  DefaultContextMenu,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  useValue,
  ArrangeMenuSubmenu,
  ReorderMenuSubmenu,
  ClipboardMenuGroup,
  SelectAllMenuItem,
  ToggleLockMenuItem,
  type TLUiContextMenuProps,
} from 'tldraw'
import { currentRole, tokenPopoverOpen } from './roleState'

export function PropertyContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()

  const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
  const singleShape = selectedShapes.length === 1 ? selectedShapes[0] : null
  const role = useValue(currentRole)
  const isGM = role === 'GM'
  const isGmOnly = singleShape?.meta?.gmOnly === true
  const selectToolActive = useValue('isSelectToolActive', () => editor.getCurrentToolId() === 'select', [editor])

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
      {selectToolActive && (
        <>
          <TldrawUiMenuGroup id="modify">
            <ArrangeMenuSubmenu />
            <ReorderMenuSubmenu />
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="lock">
            <ToggleLockMenuItem />
          </TldrawUiMenuGroup>
          <ClipboardMenuGroup />
          <TldrawUiMenuGroup id="select-all">
            <SelectAllMenuItem />
          </TldrawUiMenuGroup>
        </>
      )}
      {singleShape && selectToolActive && (
        <TldrawUiMenuGroup id="edit-properties">
          <TldrawUiMenuItem
            id="edit-properties"
            label="Edit Properties"
            onSelect={() => tokenPopoverOpen.set(true)}
          />
        </TldrawUiMenuGroup>
      )}
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
