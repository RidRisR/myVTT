// src/stores/layoutStore.ts
import { createStore } from 'zustand/vanilla'
import type {
  RegionLayoutConfig,
  RegionLayoutEntry,
  OnDemandInstance,
} from '../ui-system/regionTypes'
import { migrateLayoutConfig } from '../ui-system/layoutMigration'
import { computeResizeCompensation } from '../ui-system/layoutEngine'

function isSameEntry(left: RegionLayoutEntry, right: RegionLayoutEntry): boolean {
  return (
    left.anchor === right.anchor &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.width === right.width &&
    left.height === right.height &&
    left.zOrder === right.zOrder &&
    left.visible === right.visible &&
    left.resizeOrigin === right.resizeOrigin &&
    left.instanceProps === right.instanceProps
  )
}

export interface RoomLayoutConfig {
  narrative: RegionLayoutConfig
  tactical: RegionLayoutConfig
}

export interface LayoutStoreState {
  narrative: RegionLayoutConfig
  tactical: RegionLayoutConfig
  isTactical: boolean
  layoutMode: 'play' | 'edit'
  /** Derived: points to narrative or tactical based on isTactical */
  activeLayout: RegionLayoutConfig
  isEditing: boolean

  // On-demand instance state (ephemeral, not persisted)
  onDemandInstances: OnDemandInstance[]
  onDemandZCounter: number

  loadLayout(config: RoomLayoutConfig): void
  updateEntry(instanceKey: string, partial: Partial<RegionLayoutEntry>): void
  addEntry(instanceKey: string, entry: RegionLayoutEntry): void
  removeEntry(instanceKey: string): void
  setLayoutMode(mode: 'play' | 'edit'): void
  setIsTactical(tactical: boolean): void

  // On-demand methods
  openOnDemand(regionId: string, instanceKey: string, instanceProps: Record<string, unknown>): void
  closeOnDemand(instanceKey: string): void
  bringToFront(instanceKey: string): void
}

export function createLayoutStore() {
  return createStore<LayoutStoreState>((set, get) => ({
    narrative: {},
    tactical: {},
    isTactical: false,
    layoutMode: 'play' as const,
    activeLayout: {},
    isEditing: false,
    onDemandInstances: [],
    onDemandZCounter: 0,

    loadLayout: (config) => {
      const isTactical = get().isTactical
      // Always run migration — migrateLayoutConfig is idempotent (passes through new-format entries)
      const viewport =
        typeof window !== 'undefined'
          ? { width: window.innerWidth, height: window.innerHeight }
          : { width: 1920, height: 1080 }
      const narrative = migrateLayoutConfig(config.narrative as Record<string, unknown>, viewport)
      const tactical = migrateLayoutConfig(config.tactical as Record<string, unknown>, viewport)

      set({
        narrative,
        tactical,
        activeLayout: isTactical ? tactical : narrative,
      })
    },

    updateEntry: (instanceKey, partial) => {
      const { isTactical, narrative, tactical } = get()
      const modeKey = isTactical ? 'tactical' : 'narrative'
      const current = isTactical ? tactical : narrative
      const entry = current[instanceKey]
      if (!entry) return

      // Apply resizeOrigin compensation when size changes
      let merged = { ...entry, ...partial }
      if (entry.resizeOrigin && (partial.width !== undefined || partial.height !== undefined)) {
        const oldSize = { width: entry.width, height: entry.height }
        const newSize = { width: merged.width, height: merged.height }
        const { dOffsetX, dOffsetY } = computeResizeCompensation(
          oldSize,
          newSize,
          entry.anchor,
          entry.resizeOrigin,
        )
        if (dOffsetX !== 0 || dOffsetY !== 0) {
          merged = {
            ...merged,
            offsetX: entry.offsetX + dOffsetX,
            offsetY: entry.offsetY + dOffsetY,
          }
        }
      }

      if (isSameEntry(entry, merged)) return

      const updated = { ...current, [instanceKey]: merged }
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

    openOnDemand: (regionId, instanceKey, instanceProps) => {
      const counter = get().onDemandZCounter + 1
      set({
        onDemandInstances: [
          ...get().onDemandInstances,
          { regionId, instanceKey, instanceProps, zOrder: counter },
        ],
        onDemandZCounter: counter,
      })
    },

    closeOnDemand: (instanceKey) => {
      set({
        onDemandInstances: get().onDemandInstances.filter((i) => i.instanceKey !== instanceKey),
      })
    },

    bringToFront: (instanceKey) => {
      const counter = get().onDemandZCounter + 1
      set({
        onDemandInstances: get().onDemandInstances.map((i) =>
          i.instanceKey === instanceKey ? { ...i, zOrder: counter } : i,
        ),
        onDemandZCounter: counter,
      })
    },
  }))
}

// Singleton layout store for production use
let _layoutStore: ReturnType<typeof createLayoutStore> | null = null

export function getLayoutStore() {
  if (!_layoutStore) _layoutStore = createLayoutStore()
  return _layoutStore
}
