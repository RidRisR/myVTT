import {
  DefaultImageToolbar,
  TldrawUiToolbarButton,
  TldrawUiButtonIcon,
  useEditor,
  useValue,
  useActions,
} from 'tldraw'
import { tokenPopoverOpen } from './roleState'

export function CustomImageToolbar() {
  const editor = useEditor()
  const actions = useActions()
  const isInCropMode = useValue('crop', () => editor.isIn('select.crop'), [editor])

  const handleCrop = () => editor.setCurrentTool('select.crop.idle')
  const handleConfirm = () => {
    editor.setCroppingShape(null)
    editor.setCurrentTool('select.idle')
  }
  const handleEditProperties = () => {
    tokenPopoverOpen.set(!tokenPopoverOpen.get())
  }

  return (
    <DefaultImageToolbar>
      {isInCropMode ? (
        <TldrawUiToolbarButton type="icon" onClick={handleConfirm} title="Confirm">
          <TldrawUiButtonIcon small icon="check" />
        </TldrawUiToolbarButton>
      ) : (
        <>
          <TldrawUiToolbarButton type="icon" onClick={handleCrop} title="Crop">
            <TldrawUiButtonIcon small icon="crop" />
          </TldrawUiToolbarButton>
          <TldrawUiToolbarButton type="icon" onClick={() => actions['toggle-lock'].onSelect('image-toolbar')} title="Lock / Unlock">
            <TldrawUiButtonIcon small icon="lock" />
          </TldrawUiToolbarButton>
          <TldrawUiToolbarButton type="icon" onClick={() => actions['bring-forward'].onSelect('image-toolbar')} title="Bring Forward">
            <TldrawUiButtonIcon small icon="bring-forward" />
          </TldrawUiToolbarButton>
          <TldrawUiToolbarButton type="icon" onClick={() => actions['send-backward'].onSelect('image-toolbar')} title="Send Backward">
            <TldrawUiButtonIcon small icon="send-backward" />
          </TldrawUiToolbarButton>
          <TldrawUiToolbarButton type="icon" onClick={handleEditProperties} title="Edit Properties">
            <TldrawUiButtonIcon small icon="edit" />
          </TldrawUiToolbarButton>
        </>
      )}
    </DefaultImageToolbar>
  )
}
