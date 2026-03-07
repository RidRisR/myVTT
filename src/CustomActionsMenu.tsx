import {
  DefaultActionsMenu,
  TldrawUiMenuActionItem,
  TldrawUiToolbarButton,
  TldrawUiButtonIcon,
  useEditor,
  useValue,
  type TLUiActionsMenuProps,
} from 'tldraw'
import { tokenPopoverOpen } from './roleState'

export function CustomActionsMenu(props: TLUiActionsMenuProps) {
  const editor = useEditor()

  const canCrop = useValue('canCrop', () => {
    const shape = editor.getOnlySelectedShape()
    return shape ? editor.canCropShape(shape) : false
  }, [editor])

  const hasSelected = useValue('hasSelected', () => editor.getSelectedShapeIds().length > 0, [editor])

  const handleCrop = () => {
    const shape = editor.getOnlySelectedShape()
    if (!shape) return
    editor.markHistoryStoppingPoint('crop')
    editor.setCroppingShape(shape)
    editor.setCurrentTool('select.crop.idle')
  }

  const handleEditProperties = () => {
    tokenPopoverOpen.set(!tokenPopoverOpen.get())
  }

  return (
    <DefaultActionsMenu>
      {canCrop && (
        <TldrawUiToolbarButton type="icon" title="Crop" onClick={handleCrop}>
          <TldrawUiButtonIcon icon="crop" small />
        </TldrawUiToolbarButton>
      )}
      <TldrawUiMenuActionItem actionId="toggle-lock" />
      <TldrawUiMenuActionItem actionId="bring-forward" />
      <TldrawUiMenuActionItem actionId="send-backward" />
      {hasSelected && (
        <TldrawUiToolbarButton type="icon" title="Edit Properties" onClick={handleEditProperties}>
          <TldrawUiButtonIcon icon="edit" small />
        </TldrawUiToolbarButton>
      )}
    </DefaultActionsMenu>
  )
}
