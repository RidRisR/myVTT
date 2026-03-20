import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useUiStore } from '../../stores/uiStore'
import { toolRegistry } from '../tools/toolRegistry'
import { BuiltinToolId } from '../tools/builtinToolIds'
import type { KonvaMapHandle } from '../KonvaMap'

interface UseTacticalKeyboardParams {
  mapRef: RefObject<KonvaMapHandle | null>
  enabled: boolean
}

export function useTacticalKeyboard({ mapRef, enabled }: UseTacticalKeyboardParams) {
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const toggleGridConfig = useUiStore((s) => s.toggleGridConfig)
  const setGridConfigOpen = useUiStore((s) => s.setGridConfigOpen)

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = e.key.toLowerCase()

      // Non-tool shortcuts (camera controls, escape)
      switch (key) {
        case '=':
        case '+':
          mapRef.current?.zoomIn()
          e.preventDefault()
          return
        case '-':
          mapRef.current?.zoomOut()
          e.preventDefault()
          return
        case 'f':
          mapRef.current?.fitToWindow()
          e.preventDefault()
          return
        case '0':
          mapRef.current?.resetCenter()
          e.preventDefault()
          return
        case 'escape':
          // Close grid panel if open, otherwise reset to select tool
          if (useUiStore.getState().gridConfigOpen) {
            setGridConfigOpen(false)
          } else {
            setActiveTool(BuiltinToolId.Select)
          }
          e.preventDefault()
          return
      }

      // Match registered tool shortcuts
      for (const tool of toolRegistry.getAll()) {
        if (tool.shortcut && tool.shortcut.toLowerCase() === key) {
          // GridConfig tool toggles the config panel instead of activating as a tool
          if (tool.id === BuiltinToolId.GridConfig) {
            toggleGridConfig()
          } else {
            setActiveTool(tool.id)
          }
          e.preventDefault()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, mapRef, setActiveTool, toggleGridConfig, setGridConfigOpen])
}
