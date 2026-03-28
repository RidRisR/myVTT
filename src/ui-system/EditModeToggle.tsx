// src/ui-system/EditModeToggle.tsx
import { useSyncExternalStore } from 'react'
import type { StoreApi } from 'zustand'
import type { LayoutStoreState } from '../stores/layoutStore'

interface Props {
  store: StoreApi<LayoutStoreState>
}

export function EditModeToggle({ store }: Props) {
  const layoutMode = useSyncExternalStore(
    store.subscribe,
    () => store.getState().layoutMode,
  )

  return (
    <button
      className="fixed bottom-4 right-4 z-[1000] rounded-md bg-gray-800 px-3 py-1.5 text-xs text-white shadow-lg hover:bg-gray-700"
      onClick={() => {
        const current = store.getState().layoutMode
        store.getState().setLayoutMode(current === 'play' ? 'edit' : 'play')
      }}
    >
      {layoutMode === 'edit' ? 'Lock Layout' : 'Edit Layout'}
    </button>
  )
}
