import { usePocStore } from './store'
import type { IDataReader } from './types'

export function createDataReader(): IDataReader {
  return {
    entity: (id) => usePocStore.getState().entities[id],
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- caller-side cast is intentional
    component: <T,>(entityId: string, key: string) =>
      usePocStore.getState().entities[entityId]?.components[key] as T | undefined,
    global: (key) => usePocStore.getState().globals[key],
    query: ({ has }) => {
      const all = Object.values(usePocStore.getState().entities)
      if (!has || has.length === 0) return all
      return all.filter((e) => has.every((k) => k in e.components))
    },
  }
}
