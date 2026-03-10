// src/stores/uiStore.ts
// Client-only UI state. No Yjs observers needed — purely local.

import { create } from 'zustand'
import type { HandoutAsset } from './worldStore'

interface ContextMenuState {
  x: number
  y: number
}

interface UiState {
  inspectedCharacterId: string | null
  selectedTokenId: string | null
  bgContextMenu: ContextMenuState | null
  editingHandout: HandoutAsset | null

  setInspectedCharacterId: (id: string | null) => void
  setSelectedTokenId: (id: string | null) => void
  setBgContextMenu: (menu: ContextMenuState | null) => void
  setEditingHandout: (asset: HandoutAsset | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  inspectedCharacterId: null,
  selectedTokenId: null,
  bgContextMenu: null,
  editingHandout: null,

  setInspectedCharacterId: (id) => set({ inspectedCharacterId: id }),
  setSelectedTokenId: (id) => set({ selectedTokenId: id }),
  setBgContextMenu: (menu) => set({ bgContextMenu: menu }),
  setEditingHandout: (asset) => set({ editingHandout: asset }),
}))
