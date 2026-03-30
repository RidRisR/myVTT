// src/workflow/logStreamDispatcher.ts
import type { GameLogEntry } from '../shared/logTypes'
import { MAX_CHAIN_DEPTH } from '../shared/logTypes'
import { uuidv7 } from '../shared/uuidv7'
import type { TriggerRegistry } from './triggerRegistry'
import type { IWorkflowRunner, WorkflowHandle } from './types'

export class LogStreamDispatcher {
  private triggerRegistry: TriggerRegistry
  private runner: IWorkflowRunner
  private getSeatId: () => string
  private getWatermark: () => number

  constructor(opts: {
    triggerRegistry: TriggerRegistry
    runner: IWorkflowRunner
    getSeatId: () => string
    getWatermark: () => number
  }) {
    this.triggerRegistry = opts.triggerRegistry
    this.runner = opts.runner
    this.getSeatId = opts.getSeatId
    this.getWatermark = opts.getWatermark
  }

  /**
   * Called for each incoming log:new entry.
   * @param watermarkOverride — when provided, used instead of this.getWatermark()
   *   for the historical-entry check. This is needed when the caller already knows
   *   the pre-update watermark (e.g., from a zustand subscribe callback where the
   *   store's watermark has already been updated in the same batch).
   */
  async dispatch(entry: GameLogEntry, watermarkOverride?: number): Promise<void> {
    // Skip historical entries (loaded during reconnect)
    const watermark = watermarkOverride ?? this.getWatermark()
    if (entry.seq <= watermark) return
    // Only triggerable entries
    if (!entry.triggerable) return
    // Cascade protection
    if (entry.chainDepth >= MAX_CHAIN_DEPTH) return
    // Executor routing: only execute on the matching client
    if (entry.executor !== this.getSeatId()) return

    const triggers = this.triggerRegistry.getMatchingTriggers(entry)
    // Serial execution — no parallel to avoid race conditions
    for (const trigger of triggers) {
      const input = trigger.mapInput(entry)
      await this.runner.runWorkflow({ name: trigger.workflow } as WorkflowHandle, input, {
        groupId: uuidv7(),
        causedBy: entry.id,
        chainDepth: entry.chainDepth + 1,
      })
    }
  }
}
