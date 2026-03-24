// src/workflow/logStreamDispatcher.ts
import type { GameLogEntry } from '../shared/logTypes'
import { MAX_CHAIN_DEPTH } from '../shared/logTypes'
import type { TriggerRegistry } from './triggerRegistry'
import type { IWorkflowRunner, WorkflowHandle } from './types'

export class LogStreamDispatcher {
  private triggerRegistry: TriggerRegistry
  private runner: IWorkflowRunner
  private localSeatId: string
  private watermark: number

  constructor(opts: {
    triggerRegistry: TriggerRegistry
    runner: IWorkflowRunner
    localSeatId: string
    watermark: number
  }) {
    this.triggerRegistry = opts.triggerRegistry
    this.runner = opts.runner
    this.localSeatId = opts.localSeatId
    this.watermark = opts.watermark
  }

  /** Called for each incoming log:new entry */
  async dispatch(entry: GameLogEntry): Promise<void> {
    // Skip historical entries (loaded during reconnect)
    if (entry.seq <= this.watermark) return
    // Only triggerable entries
    if (!entry.triggerable) return
    // Cascade protection
    if (entry.chainDepth >= MAX_CHAIN_DEPTH) return
    // Executor routing: only execute on the matching client
    if (entry.executor !== this.localSeatId) return

    const triggers = this.triggerRegistry.getMatchingTriggers(entry)
    // Serial execution — no parallel to avoid race conditions
    for (const trigger of triggers) {
      const input = trigger.mapInput(entry)
      await this.runner.runWorkflow({ name: trigger.workflow } as WorkflowHandle, input)
    }
  }

  updateWatermark(seq: number): void {
    this.watermark = Math.max(this.watermark, seq)
  }
}
