// src/stores/uiStore.ts
// Client-only UI state. No Yjs observers needed — purely local.

import { create } from 'zustand'
import type { HandoutAsset } from './worldStore'

interface ContextMenuState {
  x: number
  y: number
}

export type ActiveTool = 'select' | 'measure' | 'range-circle' | 'range-cone' | 'range-rect'
export type MeasureTool = Exclude<ActiveTool, 'select'>

const MEASURE_TOOL_IDS: ReadonlySet<string> = new Set([
  'measure',
  'range-circle',
  'range-cone',
  'range-rect',
])

export function isMeasureTool(tool: ActiveTool): tool is MeasureTool {
  return MEASURE_TOOL_IDS.has(tool)
}
export type ThemeId = 'warm' | 'cold'
export type GmSidebarTab = 'archives' | 'entities'

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

interface UiState {
  inspectedCharacterId: string | null
  selectedTokenId: string | null
  bgContextMenu: ContextMenuState | null
  editingHandout: HandoutAsset | null
  activeTool: ActiveTool
  gmViewAsPlayer: boolean
  theme: ThemeId

  // Panel visibility
  portraitBarVisible: boolean
  teamPanelVisible: boolean

  // Tactical toolbar
  lastMeasureTool: MeasureTool
  gridConfigOpen: boolean

  // GM sidebar
  gmSidebarTab: GmSidebarTab
  gmSidebarCollapsed: boolean

  // Plugin panel portal
  activePluginPanels: ActivePluginPanel[]
  openPluginPanel: (panelId: string, entityId?: string) => void
  closePluginPanel: (panelId: string) => void

  setInspectedCharacterId: (id: string | null) => void
  setSelectedTokenId: (id: string | null) => void
  setBgContextMenu: (menu: ContextMenuState | null) => void
  setEditingHandout: (asset: HandoutAsset | null) => void
  setActiveTool: (tool: ActiveTool) => void
  setGmViewAsPlayer: (val: boolean) => void
  setTheme: (theme: ThemeId) => void
  setPortraitBarVisible: (visible: boolean) => void
  setTeamPanelVisible: (visible: boolean) => void
  setGridConfigOpen: (open: boolean) => void
  toggleGridConfig: () => void
  setGmSidebarTab: (tab: GmSidebarTab) => void
  setGmSidebarCollapsed: (collapsed: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  inspectedCharacterId: null,
  selectedTokenId: null,
  bgContextMenu: null,
  editingHandout: null,
  activeTool: 'select',
  gmViewAsPlayer: false,
  theme: getStoredTheme(),
  portraitBarVisible: true,
  teamPanelVisible: false,
  lastMeasureTool: 'measure',
  gridConfigOpen: false,
  gmSidebarTab: 'archives',
  gmSidebarCollapsed: true,

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

  setInspectedCharacterId: (id) => {
    set({ inspectedCharacterId: id })
  },
  setSelectedTokenId: (id) => {
    set({ selectedTokenId: id })
  },
  setBgContextMenu: (menu) => {
    set({ bgContextMenu: menu })
  },
  setEditingHandout: (asset) => {
    set({ editingHandout: asset })
  },
  setActiveTool: (tool) => {
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
  setTeamPanelVisible: (visible) => {
    set({ teamPanelVisible: visible })
  },
  setGridConfigOpen: (open) => {
    set({ gridConfigOpen: open })
  },
  toggleGridConfig: () => {
    set((s) => ({ gridConfigOpen: !s.gridConfigOpen }))
  },
  setGmSidebarTab: (tab) => {
    set({ gmSidebarTab: tab })
  },
  setGmSidebarCollapsed: (collapsed) => {
    set({ gmSidebarCollapsed: collapsed })
  },
}))
