// src/stores/layoutStore.ts
import { createStore } from 'zustand/vanilla'
import type { LayoutConfig, LayoutEntry } from '../ui-system/types'

export interface RoomLayoutConfig {
  narrative: LayoutConfig
  tactical: LayoutConfig
}

export interface LayoutStoreState {
  narrative: LayoutConfig
  tactical: LayoutConfig
  isTactical: boolean
  layoutMode: 'play' | 'edit'
  /** Derived: points to narrative or tactical based on isTactical */
  activeLayout: LayoutConfig
  isEditing: boolean

  loadLayout(config: RoomLayoutConfig): void
  updateEntry(instanceKey: string, partial: Partial<LayoutEntry>): void
  addEntry(instanceKey: string, entry: LayoutEntry): void
  removeEntry(instanceKey: string): void
  setLayoutMode(mode: 'play' | 'edit'): void
  setIsTactical(tactical: boolean): void
}

export function createLayoutStore() {
  return createStore<LayoutStoreState>((set, get) => ({
    narrative: {},
    tactical: {},
    isTactical: false,
    layoutMode: 'play' as const,
    activeLayout: {},
    isEditing: false,

    loadLayout: (config) => {
      const isTactical = get().isTactical
      set({
        narrative: config.narrative,
        tactical: config.tactical,
        activeLayout: isTactical ? config.tactical : config.narrative,
      })
    },

    updateEntry: (instanceKey, partial) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const entry = current[instanceKey]
      if (!entry) return
      const updated = { ...current, [instanceKey]: { ...entry, ...partial } }
      set({
        [modeKey]: updated,
        activeLayout: updated,
      } as Partial<LayoutStoreState>)
    },

    addEntry: (instanceKey, entry) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const updated = { ...current, [instanceKey]: entry }
      set({
        [modeKey]: updated,
        activeLayout: updated,
      } as Partial<LayoutStoreState>)
    },

    removeEntry: (instanceKey) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const rest = Object.fromEntries(
        Object.entries(current).filter(([k]) => k !== instanceKey),
      ) as typeof current
      set({
        [modeKey]: rest,
        activeLayout: rest,
      } as Partial<LayoutStoreState>)
    },

    setLayoutMode: (mode) => {
      set({ layoutMode: mode, isEditing: mode === 'edit' })
    },

    setIsTactical: (tactical) => {
      const { narrative, tactical: tac } = get()
      set({
        isTactical: tactical,
        activeLayout: tactical ? tac : narrative,
      })
    },
  }))
}
