import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useUiStore } from '../../stores/uiStore'
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

      switch (e.key.toLowerCase()) {
        case 'v':
          setActiveTool('select')
          break
        case 'm':
          setActiveTool('measure')
          break
        case '1':
          setActiveTool('range-circle')
          break
        case '2':
          setActiveTool('range-cone')
          break
        case '3':
          setActiveTool('range-rect')
          break
        case 'g':
          toggleGridConfig()
          break
        case '=':
        case '+':
          mapRef.current?.zoomIn()
          break
        case '-':
          mapRef.current?.zoomOut()
          break
        case 'f':
          mapRef.current?.fitToWindow()
          break
        case '0':
          mapRef.current?.resetCenter()
          break
        case 'escape':
          // Close grid panel if open, otherwise reset to select tool
          if (useUiStore.getState().gridConfigOpen) {
            setGridConfigOpen(false)
          } else {
            setActiveTool('select')
          }
          break
        default:
          return // Don't prevent default for unhandled keys
      }
      e.preventDefault()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, mapRef, setActiveTool, toggleGridConfig, setGridConfigOpen])
}
