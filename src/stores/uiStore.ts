// src/stores/uiStore.ts
// Client-only UI state. No Yjs observers needed — purely local.

import { create } from 'zustand'
import type { HandoutAsset } from './worldStore'
import type { TokenAction, TargetInfo } from '../rules/types'
import type { Entity } from '../shared/entityTypes'
import { toolRegistry } from '../combat/tools/toolRegistry'
import { BuiltinToolId } from '../combat/tools/builtinToolIds'

interface ContextMenuState {
  x: number
  y: number
}

// Requires registerBuiltinTools to have run (imported by TacticalToolbar).
export function isMeasureTool(tool: string): boolean {
  return toolRegistry.get(tool)?.category === 'measurement'
}
export type GmDockTab = 'maps' | 'tokens' | 'characters' | 'handouts' | 'dice'
export type ThemeId = 'warm' | 'cold'
export type GmSidebarTab = 'archives' | 'entities' | 'scene'

export interface ActivePluginPanel {
  panelId: string
  entityId?: string
}

export interface PinnedCard {
  entityId: string
  position: { x: number; y: number }
}

const EMPTY_PINNED: PinnedCard[] = []

function getStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem('vtt-theme')
    if (v === 'warm' || v === 'cold') return v
  } catch {
    /* ignore */
  }
  return 'warm'
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem('vtt-theme', theme)
  } catch {
    /* ignore */
  }
}

// Apply stored theme immediately on module load
applyTheme(getStoredTheme())

const EMPTY_SELECTION: string[] = []

interface UiState {
  // Character card state (multi-card with pin support)
  openCardId: string | null // Current unpinned anchored card (max 1)
  pinnedCards: PinnedCard[] // Pinned floating cards (multiple allowed)

  selectedTokenIds: string[]
  primarySelectedTokenId: string | null
  bgContextMenu: ContextMenuState | null
  editingHandout: HandoutAsset | null
  activeTool: string
  gmViewAsPlayer: boolean
  theme: ThemeId

  // Panel visibility
  portraitBarVisible: boolean

  // Tactical toolbar
  lastMeasureTool: string
  toolPersist: boolean
  gridConfigOpen: boolean

  // GM sidebar
  gmSidebarTab: GmSidebarTab
  gmSidebarCollapsed: boolean

  // GM dock
  gmDockTab: GmDockTab | null
  setGmDockTab: (tab: GmDockTab | null) => void

  // Plugin panel portal
  activePluginPanels: ActivePluginPanel[]
  openPluginPanel: (panelId: string, entityId?: string) => void
  closePluginPanel: (panelId: string) => void

  // Character card actions
  openCard: (entityId: string) => void
  closeCard: () => void
  pinCard: (entityId: string, position: { x: number; y: number }) => void
  unpinCard: (entityId: string) => void
  updatePinnedCardPosition: (entityId: string, position: { x: number; y: number }) => void
  closePinnedCard: (entityId: string) => void

  // Multi-select token methods
  setSelectedTokenIds: (ids: string[]) => void
  setPrimarySelectedTokenId: (id: string | null) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  selectToken: (id: string) => void
  setBgContextMenu: (menu: ContextMenuState | null) => void
  setEditingHandout: (asset: HandoutAsset | null) => void
  setActiveTool: (tool: string) => void
  setGmViewAsPlayer: (val: boolean) => void
  setTheme: (theme: ThemeId) => void
  setPortraitBarVisible: (visible: boolean) => void
  setGridConfigOpen: (open: boolean) => void
  toggleGridConfig: () => void
  toggleToolPersist: () => void
  setGmSidebarTab: (tab: GmSidebarTab) => void
  setGmSidebarCollapsed: (collapsed: boolean) => void

  // Action targeting
  activeTargetingRequest: {
    action: TokenAction
    actor: Entity
    collectedTargets: TargetInfo[]
  } | null
  startTargeting: (action: TokenAction, actor: Entity) => void
  addTargetingTarget: (target: TargetInfo) => void
  cancelTargeting: () => void
}

export const useUiStore = create<UiState>((set) => ({
  openCardId: null,
  pinnedCards: EMPTY_PINNED,
  selectedTokenIds: EMPTY_SELECTION,
  primarySelectedTokenId: null,
  bgContextMenu: null,
  editingHandout: null,
  activeTool: BuiltinToolId.Select,
  gmViewAsPlayer: false,
  theme: getStoredTheme(),
  portraitBarVisible: true,
  lastMeasureTool: BuiltinToolId.Measure,
  toolPersist: false,
  gridConfigOpen: false,
  gmSidebarTab: 'scene',
  gmSidebarCollapsed: true,
  gmDockTab: null,
  setGmDockTab: (tab) => {
    set({ gmDockTab: tab })
  },

  activePluginPanels: [],
  openPluginPanel: (panelId, entityId) => {
    set((s) => ({
      activePluginPanels: [
        ...s.activePluginPanels.filter((p) => p.panelId !== panelId),
        { panelId, entityId },
      ],
    }))
  },
  closePluginPanel: (panelId) => {
    set((s) => ({
      activePluginPanels: s.activePluginPanels.filter((p) => p.panelId !== panelId),
    }))
  },

  openCard: (entityId) => {
    set((s) => {
      // Already pinned — ignore
      if (s.pinnedCards.some((p) => p.entityId === entityId)) return s
      return { openCardId: entityId }
    })
  },
  closeCard: () => {
    set({ openCardId: null })
  },
  pinCard: (entityId, position) => {
    set((s) => ({
      openCardId: null,
      pinnedCards: [
        ...s.pinnedCards.filter((p) => p.entityId !== entityId),
        { entityId, position },
      ],
    }))
  },
  unpinCard: (entityId) => {
    set((s) => ({
      openCardId: entityId,
      pinnedCards: s.pinnedCards.filter((p) => p.entityId !== entityId),
    }))
  },
  updatePinnedCardPosition: (entityId, position) => {
    set((s) => ({
      pinnedCards: s.pinnedCards.map((p) => (p.entityId === entityId ? { ...p, position } : p)),
    }))
  },
  closePinnedCard: (entityId) => {
    set((s) => ({
      pinnedCards: s.pinnedCards.filter((p) => p.entityId !== entityId),
    }))
  },
  setSelectedTokenIds: (ids) => {
    set({ selectedTokenIds: ids.length === 0 ? EMPTY_SELECTION : ids })
  },
  setPrimarySelectedTokenId: (id) => {
    set({ primarySelectedTokenId: id })
  },
  addToSelection: (id) => {
    set((s) => {
      if (s.selectedTokenIds.includes(id)) return s
      return { selectedTokenIds: [...s.selectedTokenIds, id] }
    })
  },
  removeFromSelection: (id) => {
    set((s) => {
      const next = s.selectedTokenIds.filter((x) => x !== id)
      return {
        selectedTokenIds: next.length === 0 ? EMPTY_SELECTION : next,
        primarySelectedTokenId: s.primarySelectedTokenId === id ? null : s.primarySelectedTokenId,
      }
    })
  },
  toggleSelection: (id) => {
    set((s) => {
      if (s.selectedTokenIds.includes(id)) {
        const next = s.selectedTokenIds.filter((x) => x !== id)
        return {
          selectedTokenIds: next.length === 0 ? EMPTY_SELECTION : next,
          primarySelectedTokenId: s.primarySelectedTokenId === id ? null : s.primarySelectedTokenId,
        }
      }
      return { selectedTokenIds: [...s.selectedTokenIds, id] }
    })
  },
  clearSelection: () => {
    set({ selectedTokenIds: EMPTY_SELECTION, primarySelectedTokenId: null })
  },
  selectToken: (id) => {
    set({ selectedTokenIds: [id], primarySelectedTokenId: id })
  },
  setBgContextMenu: (menu) => {
    set({ bgContextMenu: menu })
  },
  setEditingHandout: (asset) => {
    set({ editingHandout: asset })
  },
  setActiveTool: (tool) => {
    if (!toolRegistry.has(tool)) {
      console.warn(`Unknown tool "${tool}", ignoring`)
      return
    }
    set(isMeasureTool(tool) ? { activeTool: tool, lastMeasureTool: tool } : { activeTool: tool })
  },
  setGmViewAsPlayer: (val) => {
    set({ gmViewAsPlayer: val })
  },
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  setPortraitBarVisible: (visible) => {
    set({ portraitBarVisible: visible })
  },
  setGridConfigOpen: (open) => {
    set({ gridConfigOpen: open })
  },
  toggleGridConfig: () => {
    set((s) => ({ gridConfigOpen: !s.gridConfigOpen }))
  },
  toggleToolPersist: () => {
    set((s) => ({ toolPersist: !s.toolPersist }))
  },
  setGmSidebarTab: (tab) => {
    set({ gmSidebarTab: tab })
  },
  setGmSidebarCollapsed: (collapsed) => {
    set({ gmSidebarCollapsed: collapsed })
  },

  activeTargetingRequest: null,
  startTargeting: (action, actor) => {
    set({
      activeTargetingRequest: { action, actor, collectedTargets: [] },
      activeTool: BuiltinToolId.ActionTargeting,
    })
  },
  addTargetingTarget: (target) => {
    set((s) => {
      if (!s.activeTargetingRequest) return s
      const req = s.activeTargetingRequest
      const next = [...req.collectedTargets, target]
      const needed = req.action.targeting?.count ?? 1
      if (next.length >= needed) {
        // Execute the action and return to select
        req.action.onExecute(req.actor, next)
        return {
          activeTargetingRequest: null,
          activeTool: BuiltinToolId.Select,
        }
      }
      return {
        activeTargetingRequest: { ...req, collectedTargets: next },
      }
    })
  },
  cancelTargeting: () => {
    set({
      activeTargetingRequest: null,
      activeTool: BuiltinToolId.Select,
    })
  },
}))
