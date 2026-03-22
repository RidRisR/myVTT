// poc/types.ts — Core types for the POC plugin verification sandbox

export interface PocEntity {
  id: string
  name: string
  imageUrl: string
  color: string
  components: Record<string, unknown>
}

export interface PocGlobal {
  key: string
  [k: string]: unknown
}

/** Imperative one-shot reader (non-hook, usable anywhere) */
export interface IDataReader {
  entity(id: string): PocEntity | undefined
  component<T>(entityId: string, key: string): T | undefined
  global(key: string): PocGlobal | undefined
  query(spec: { has?: string[] }): PocEntity[]
}
