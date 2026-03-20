// Tool registry — module-level singleton.
// All tools (builtin and plugin) register here at app startup.
// This is NOT a zustand store because tool definitions are static.

import type { ToolDefinition, ToolCategory } from './types'

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(def: ToolDefinition): void {
    if (this.tools.has(def.id)) {
      console.warn(`Tool "${def.id}" already registered, skipping`)
      return
    }
    this.tools.set(def.id, def)
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id)
  }

  getAll(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  getByCategory(cat: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === cat)
  }

  has(id: string): boolean {
    return this.tools.has(id)
  }
}

export const toolRegistry = new ToolRegistry()
