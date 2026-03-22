import { create } from 'zustand'
import type { PocEntity, PocGlobal } from './types'

interface PocStoreState {
  entities: Record<string, PocEntity>
  globals: Record<string, PocGlobal>
  updateEntityComponent: (
    entityId: string,
    key: string,
    updater: (current: unknown) => unknown,
  ) => void
  patchGlobal: (key: string, patch: Record<string, unknown>) => void
}

export const usePocStore = create<PocStoreState>((set) => ({
  entities: {},
  globals: {},

  updateEntityComponent: (entityId, key, updater) => {
    set((state) => {
      const entity = state.entities[entityId]
      if (!entity) return state
      return {
        entities: {
          ...state.entities,
          [entityId]: {
            ...entity,
            components: {
              ...entity.components,
              [key]: updater(entity.components[key]),
            },
          },
        },
      }
    })
  },

  patchGlobal: (key, patch) => {
    set((state) => {
      const existing = state.globals[key]
      if (!existing) return state
      return {
        globals: {
          ...state.globals,
          [key]: { ...existing, ...patch },
        },
      }
    })
  },
}))
