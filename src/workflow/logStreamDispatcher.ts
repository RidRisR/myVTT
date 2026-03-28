// src/workflow/logStreamDispatcher.ts
import type { GameLogEntry } from '../shared/logTypes'
import { MAX_CHAIN_DEPTH } from '../shared/logTypes'
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

  /** Called for each incoming log:new entry */
  async dispatch(entry: GameLogEntry): Promise<void> {
    // Skip historical entries (loaded during reconnect)
    if (entry.seq <= this.getWatermark()) return
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
      await this.runner.runWorkflow({ name: trigger.workflow } as WorkflowHandle, input)
    }
  }
}
