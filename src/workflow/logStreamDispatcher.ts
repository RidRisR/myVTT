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
  private _lastDispatchedSeq = 0

  constructor(opts: {
    triggerRegistry: TriggerRegistry
    runner: IWorkflowRunner
    getSeatId: () => string
  }) {
    this.triggerRegistry = opts.triggerRegistry
    this.runner = opts.runner
    this.getSeatId = opts.getSeatId
  }

  /** Set the initial cursor — entries with seq <= watermark are considered historical. */
  startFrom(watermark: number): void {
    this._lastDispatchedSeq = watermark
  }

  /**
   * Replay entries that may have arrived between store init and subscribe.
   * Only processes entries with seq > _lastDispatchedSeq (safe to call with full store).
   */
  catchUp(entries: GameLogEntry[]): void {
    for (const entry of entries) {
      if (entry.seq > this._lastDispatchedSeq) {
        void this.dispatch(entry)
      }
    }
  }

  /**
   * Called for each incoming log entry.
   * Idempotent — entries with seq <= _lastDispatchedSeq are skipped.
   */
  async dispatch(entry: GameLogEntry): Promise<void> {
    // Idempotent: skip already-processed or historical entries
    if (entry.seq <= this._lastDispatchedSeq) return
    // Advance cursor
    this._lastDispatchedSeq = entry.seq
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
