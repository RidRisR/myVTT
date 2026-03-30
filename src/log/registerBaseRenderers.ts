import { registerRenderer } from './rendererRegistry'
import { TextEntryRenderer } from './renderers/TextEntryRenderer'
import { RollResultRenderer } from './renderers/RollResultRenderer'

export function registerBaseRenderers(): void {
  registerRenderer('chat', 'core:text', TextEntryRenderer)
  registerRenderer('chat', 'core:roll-result', RollResultRenderer)
}
