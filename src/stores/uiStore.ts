// src/stores/uiStore.ts
// Client-only UI state. No Yjs observers needed — purely local.

import { create } from 'zustand'
import type { HandoutAsset } from './worldStore'

interface ContextMenuState {
  x: number
  y: number
}

export type ActiveTool = 'select' | 'measure' | 'range-circle' | 'range-cone' | 'range-rect'

interface UiState {
  inspectedCharacterId: string | null
  selectedTokenId: string | null
  bgContextMenu: ContextMenuState | null
  editingHandout: HandoutAsset | null
  activeTool: ActiveTool

  setInspectedCharacterId: (id: string | null) => void
  setSelectedTokenId: (id: string | null) => void
  setBgContextMenu: (menu: ContextMenuState | null) => void
  setEditingHandout: (asset: HandoutAsset | null) => void
  setActiveTool: (tool: ActiveTool) => void
}

export const useUiStore = create<UiState>((set) => ({
  inspectedCharacterId: null,
  selectedTokenId: null,
  bgContextMenu: null,
  editingHandout: null,
  activeTool: 'select',

  setInspectedCharacterId: (id) => set({ inspectedCharacterId: id }),
  setSelectedTokenId: (id) => set({ selectedTokenId: id }),
  setBgContextMenu: (menu) => set({ bgContextMenu: menu }),
  setEditingHandout: (asset) => set({ editingHandout: asset }),
  setActiveTool: (tool) => set({ activeTool: tool }),
}))
