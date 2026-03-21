// src/workflow/engine.ts
import type { Step, StepAddition, WrapStepOptions, WorkflowContext, StepFn } from './types'

const MAX_RECURSION_DEPTH = 10

/**
 * Metadata tracked for each step to support priority-based ordering among
 * same-anchor additions.
 */
interface StepMeta {
  step: Step
  /** The anchor step ID (undefined = appended to end with no anchor) */
  anchor?: string
  /** 'after' | 'before' | undefined (undefined = appended) */
  direction?: 'after' | 'before'
  /** Lower number = closer to front within same anchor group */
  priority: number
  /** Monotonically increasing insertion counter for stable sort */
  insertionOrder: number
}

interface WorkflowRecord {
  steps: StepMeta[]
  /** Map from step ID to its current wrapper fn (built lazily, cleared on mutations) */
  wrappers: Map<string, WrapperEntry[]>
}

interface WrapperEntry {
  priority: number
  insertionOrder: number
  run: WrapStepOptions['run']
}

export class WorkflowEngine {
  private workflows = new Map<string, WorkflowRecord>()
  private globalInsertionCounter = 0
  private currentDepth = 0

  // ── Registration ────────────────────────────────────────────────────────────

  defineWorkflow(name: string, steps: Step[]): void {
    if (this.workflows.has(name)) {
      throw new Error(`Workflow "${name}" is already defined`)
    }
    // Check duplicate step IDs within the initial list
    const seen = new Set<string>()
    for (const step of steps) {
      if (seen.has(step.id)) {
        throw new Error(`Duplicate step ID "${step.id}" in workflow "${name}"`)
      }
      seen.add(step.id)
    }

    const record: WorkflowRecord = {
      steps: steps.map((step) => ({
        step,
        anchor: undefined,
        direction: undefined,
        priority: 100,
        insertionOrder: this.globalInsertionCounter++,
      })),
      wrappers: new Map(),
    }
    this.workflows.set(name, record)
  }

  addStep(workflow: string, addition: StepAddition): void {
    const record = this.getRecord(workflow)

    if (addition.before !== undefined && addition.after !== undefined) {
      throw new Error(`Cannot specify both "before" and "after" in addStep`)
    }

    // Check for duplicate step ID
    if (record.steps.some((m) => m.step.id === addition.id)) {
      throw new Error(`Duplicate step ID "${addition.id}" in workflow "${workflow}"`)
    }

    const anchor = addition.before ?? addition.after
    const direction: 'before' | 'after' | undefined =
      addition.before !== undefined ? 'before' : addition.after !== undefined ? 'after' : undefined

    // Validate anchor exists
    if (anchor !== undefined) {
      const anchorExists = record.steps.some((m) => m.step.id === anchor)
      if (!anchorExists) {
        throw new Error(`Anchor step "${anchor}" not found in workflow "${workflow}"`)
      }
    }

    const newMeta: StepMeta = {
      step: { id: addition.id, run: addition.run },
      anchor,
      direction,
      priority: addition.priority ?? 100,
      insertionOrder: this.globalInsertionCounter++,
    }

    // Find the insertion index
    const insertIndex = this.findInsertIndex(record.steps, newMeta)
    record.steps.splice(insertIndex, 0, newMeta)
  }

  wrapStep(workflow: string, targetStepId: string, options: WrapStepOptions): void {
    const record = this.getRecord(workflow)
    const targetExists = record.steps.some((m) => m.step.id === targetStepId)
    if (!targetExists) {
      throw new Error(`Step "${targetStepId}" not found in workflow "${workflow}"`)
    }

    if (!record.wrappers.has(targetStepId)) {
      record.wrappers.set(targetStepId, [])
    }
    const entries = record.wrappers.get(targetStepId)!
    entries.push({
      priority: options.priority ?? 100,
      insertionOrder: this.globalInsertionCounter++,
      run: options.run,
    })
    // Sort: lower priority = outer; same priority = earlier registration = outer
    entries.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.insertionOrder - b.insertionOrder
    })
  }

  removeStep(workflow: string, targetStepId: string): void {
    const record = this.getRecord(workflow)
    const idx = record.steps.findIndex((m) => m.step.id === targetStepId)
    if (idx === -1) {
      throw new Error(`Step "${targetStepId}" not found in workflow "${workflow}"`)
    }
    record.steps.splice(idx, 1)
    record.wrappers.delete(targetStepId)
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  async runWorkflow(name: string, ctx: WorkflowContext): Promise<void> {
    const record = this.getRecord(name)

    if (this.currentDepth >= MAX_RECURSION_DEPTH) {
      throw new Error(
        `Recursion depth exceeded: workflow "${name}" would exceed the maximum recursion depth of ${MAX_RECURSION_DEPTH}`,
      )
    }

    this.currentDepth++
    let aborted = false

    // Patch ctx.abort so the engine can intercept it
    const originalAbort = ctx.abort
    ctx.abort = (reason?: string) => {
      aborted = true
      originalAbort?.(reason)
    }

    try {
      for (const meta of record.steps) {
        if (aborted) break

        const baseFn: StepFn = (c) => meta.step.run(c)
        const wrappers = record.wrappers.get(meta.step.id)

        if (!wrappers || wrappers.length === 0) {
          await baseFn(ctx)
        } else {
          // Build onion: outermost wrapper calls next, which may be inner wrapper or base
          // wrappers are sorted outer-first (lower priority = outer)
          // We build from innermost to outermost
          let composed: StepFn = baseFn
          for (let i = wrappers.length - 1; i >= 0; i--) {
            const wrapper = wrappers[i]
            const inner = composed
            composed = (c: WorkflowContext) => wrapper.run(c, inner)
          }
          await composed(ctx)
        }
      }
    } finally {
      this.currentDepth--
    }
  }

  // ── Inspection ──────────────────────────────────────────────────────────────

  inspectWorkflow(name: string): string[] {
    const record = this.getRecord(name)
    return record.steps.map((m) => m.step.id)
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private getRecord(name: string): WorkflowRecord {
    const record = this.workflows.get(name)
    if (!record) {
      throw new Error(`Workflow "${name}" not found`)
    }
    return record
  }

  /**
   * Finds the insertion index for a new step meta entry.
   *
   * Logic:
   * - No anchor: append to the end of all non-anchored steps (effectively end of list)
   * - anchor + after: group goes right after the anchor (and after any existing after-anchor group members)
   * - anchor + before: group goes right before the anchor (before any existing before-anchor group members)
   *
   * Within a group (same anchor + same direction), order by priority asc, then insertionOrder asc.
   */
  private findInsertIndex(steps: StepMeta[], newMeta: StepMeta): number {
    if (newMeta.anchor === undefined) {
      // No anchor — append at end; among other no-anchor steps, respect priority then insertionOrder
      // Find the position after all steps that either have an anchor or are lower/equal priority no-anchor steps
      let insertAt = steps.length
      for (let i = steps.length - 1; i >= 0; i--) {
        const m = steps[i]
        if (m.anchor === undefined) {
          // Same group (no-anchor). Compare priority
          if (
            m.priority < newMeta.priority ||
            (m.priority === newMeta.priority && m.insertionOrder < newMeta.insertionOrder)
          ) {
            // m should come before newMeta; insert after m
            insertAt = i + 1
            break
          }
          // m.priority > newMeta.priority; newMeta goes before m
          insertAt = i
        }
      }
      return insertAt
    }

    // Find anchor position
    const anchorIdx = steps.findIndex((m) => m.step.id === newMeta.anchor)
    // anchorIdx is guaranteed to be >= 0 (validated before calling this)

    if (newMeta.direction === 'after') {
      // Insert into the "after anchor" group
      // The group starts right after the anchor index and continues while steps have same anchor + direction 'after'
      let insertAt = anchorIdx + 1

      // Walk forward through existing after-anchor group members
      for (let i = anchorIdx + 1; i < steps.length; i++) {
        const m = steps[i]
        if (m.anchor === newMeta.anchor && m.direction === 'after') {
          if (
            m.priority < newMeta.priority ||
            (m.priority === newMeta.priority && m.insertionOrder < newMeta.insertionOrder)
          ) {
            insertAt = i + 1
          } else {
            break
          }
        } else {
          break
        }
      }
      return insertAt
    } else {
      // direction === 'before'
      // The group ends right before the anchor (or before any after-anchor group of a previous before-anchor member)
      // We need to find: the existing before-anchor group starts somewhere before anchorIdx
      // Walk backwards from anchorIdx - 1 to find where this group begins
      let groupStart = anchorIdx // default: insert just before anchor

      // Collect all existing 'before' group members for this anchor
      const beforeGroup: number[] = []
      for (let i = 0; i < anchorIdx; i++) {
        if (steps[i].anchor === newMeta.anchor && steps[i].direction === 'before') {
          beforeGroup.push(i)
        }
      }

      if (beforeGroup.length === 0) {
        // No existing before-anchor group; insert just before the anchor
        return anchorIdx
      }

      // Insert into the before group based on priority
      // Lower priority = earlier (further from anchor)
      groupStart = beforeGroup[0] // start of group

      let insertAt = anchorIdx // default: append to end of before-group (just before anchor)
      for (let k = beforeGroup.length - 1; k >= 0; k--) {
        const i = beforeGroup[k]
        const m = steps[i]
        if (
          m.priority < newMeta.priority ||
          (m.priority === newMeta.priority && m.insertionOrder < newMeta.insertionOrder)
        ) {
          insertAt = i + 1
          break
        }
        insertAt = i
      }
      void groupStart // suppress unused variable warning
      return insertAt
    }
  }
}
