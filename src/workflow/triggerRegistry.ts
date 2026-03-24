// src/workflow/triggerRegistry.ts
import type { TriggerDefinition, GameLogEntry } from '../shared/logTypes'

export class TriggerRegistry {
  private triggers = new Map<string, TriggerDefinition[]>()

  register(trigger: TriggerDefinition): void {
    const list = this.triggers.get(trigger.on) ?? []
    list.push(trigger)
    this.triggers.set(trigger.on, list)
  }

  getMatchingTriggers(entry: GameLogEntry): TriggerDefinition[] {
    const list = this.triggers.get(entry.type) ?? []
    return list.filter((t) => this.matchFilter(t.filter, entry.payload))
  }

  private matchFilter(
    filter: Record<string, unknown> | undefined,
    payload: Record<string, unknown>,
  ): boolean {
    if (!filter) return true
    return Object.entries(filter).every(([k, v]) => payload[k] === v)
  }

  clear(): void {
    this.triggers.clear()
  }
}
