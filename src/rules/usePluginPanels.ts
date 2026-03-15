// src/rules/usePluginPanels.ts
import { useUiStore } from '../stores/uiStore'

export function usePluginPanels() {
  const openPanel = useUiStore((s) => s.openPluginPanel)
  const closePanel = useUiStore((s) => s.closePluginPanel)
  return { openPanel, closePanel }
}
