import { useUiStore } from '../stores/uiStore'
import { toolRegistry } from './tools/toolRegistry'
import { BuiltinToolId } from './tools/builtinToolIds'
import type { ToolLayerProps } from './tools/types'

type ActiveToolCanvasProps = Omit<ToolLayerProps, 'onComplete'>

export function ActiveToolCanvas(props: ActiveToolCanvasProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const toolPersist = useUiStore((s) => s.toolPersist)
  const toolDef = toolRegistry.get(activeTool)

  if (!toolDef?.CanvasLayer) return null

  const handleComplete = () => {
    if (toolDef.defaultMode === 'one-shot' && !toolPersist) {
      setActiveTool(BuiltinToolId.Select)
    }
  }

  const CanvasLayer = toolDef.CanvasLayer
  return <CanvasLayer {...props} onComplete={handleComplete} />
}
