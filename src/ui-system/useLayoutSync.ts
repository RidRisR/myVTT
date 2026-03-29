// src/ui-system/useLayoutSync.ts
import { useEffect, useRef } from 'react'
import type { LayoutStoreState, RoomLayoutConfig } from '../stores/layoutStore'
import type { StoreApi } from 'zustand'

const DEBOUNCE_MS = 500

/**
 * Hook that subscribes to layoutStore and debounces REST PUT on changes.
 * Skips saving in edit mode — saves on transition back to play mode.
 */
export function useLayoutSync(store: StoreApi<LayoutStoreState>, roomId: string, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevModeRef = useRef<'play' | 'edit'>('play')

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = store.subscribe((state, prevState) => {
      // Detect edit → play transition: save immediately
      if (prevModeRef.current === 'edit' && state.layoutMode === 'play') {
        if (timerRef.current) clearTimeout(timerRef.current)
        const config: RoomLayoutConfig = {
          narrative: state.narrative,
          tactical: state.tactical,
        }
        void fetch(`/api/rooms/${roomId}/layout`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        }).catch((err: unknown) => {
          console.error('Layout save failed:', err)
        })
      }
      prevModeRef.current = state.layoutMode

      // Only auto-save in play mode when layout data changed
      if (state.layoutMode === 'edit') return
      if (state.narrative === prevState.narrative && state.tactical === prevState.tactical) return

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const config: RoomLayoutConfig = {
          narrative: state.narrative,
          tactical: state.tactical,
        }
        void fetch(`/api/rooms/${roomId}/layout`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        }).catch((err: unknown) => {
          console.error('Layout save failed:', err)
        })
      }, DEBOUNCE_MS)
    })

    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [store, roomId, enabled])
}
