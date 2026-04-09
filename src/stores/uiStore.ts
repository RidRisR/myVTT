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
  selectedTokenIds: string[]
  primarySelectedTokenId: string | null
  bgContextMenu: ContextMenuState | null
  editingHandout: HandoutAsset | null
  activeTool: string
  gmViewAsPlayer: boolean
  theme: ThemeId

  // Panel visibility
  teamPanelVisible: boolean

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
  setTeamPanelVisible: (visible: boolean) => void
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
  selectedTokenIds: EMPTY_SELECTION,
  primarySelectedTokenId: null,
  bgContextMenu: null,
  editingHandout: null,
  activeTool: BuiltinToolId.Select,
  gmViewAsPlayer: false,
  theme: getStoredTheme(),
  teamPanelVisible: false,
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
  setTeamPanelVisible: (visible) => {
    set({ teamPanelVisible: visible })
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
