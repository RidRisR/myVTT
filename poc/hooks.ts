import { usePocStore } from './store'
import type { PocEntity, PocGlobal } from './types'

export function useEntity(id: string): PocEntity | undefined {
  return usePocStore((s) => s.entities[id])
}

export function useComponent<T>(entityId: string, key: string): T | undefined {
  return usePocStore((s) => s.entities[entityId]?.components[key] as T | undefined)
}

export function useGlobal(key: string): PocGlobal | undefined {
  return usePocStore((s) => s.globals[key])
}
