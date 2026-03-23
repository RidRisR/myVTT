// src/workflow/engine.ts
import type {
  Step,
  StepAddition,
  AttachStepAddition,
  WrapStepOptions,
  ReplaceStepOptions,
  WorkflowContext,
  WorkflowResult,
  StepError,
  StepFn,
  InternalState,
  WorkflowHandle,
} from './types'

type StepRunFn<TData> = (ctx: WorkflowContext<TData>) => Promise<void> | void

const MAX_RECURSION_DEPTH = 10

/**
 * Metadata tracked for each step to support priority-based ordering,
 * owner tracking, and lifecycle dependencies.
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
  /** Plugin that registered this step */
  pluginOwner?: string
  /** Lifecycle dependency — set by attachStep */
  dependsOn?: string
}

interface WorkflowRecord {
  steps: StepMeta[]
  wrappers: Map<string, WrapperEntry[]>
  /** Tracks which plugin has replaced each step (only one replace per step) */
  replacements: Map<string, { pluginOwner?: string; originalRun: StepFn }>
}

interface WrapperEntry {
  priority: number
  insertionOrder: number
  run: WrapStepOptions['run']
  pluginOwner?: string
}

export class WorkflowEngine {
  private workflows = new Map<string, WorkflowRecord>()
  private globalInsertionCounter = 0
  /** Currently active plugin context for owner tracking */
  private currentPluginOwner: string | undefined = undefined

  // ── Plugin owner context ─────────────────────────────────────────────────

  setCurrentPluginOwner(pluginId: string | undefined): void {
    this.currentPluginOwner = pluginId
  }

  // ── Registration ────────────────────────────────────────────────────────────

  defineWorkflow<TData = Record<string, unknown>>(
    name: string,
    stepsOrRun?: Step<TData>[] | StepRunFn<TData>,
  ): WorkflowHandle<TData> {
    const steps: Step<TData>[] =
      stepsOrRun === undefined
        ? []
        : typeof stepsOrRun === 'function'
          ? [{ id: name, run: stepsOrRun }]
          : stepsOrRun

    if (this.workflows.has(name)) {
      throw new Error(`Workflow "${name}" is already defined`)
    }
    const seen = new Set<string>()
    for (const step of steps) {
      if (seen.has(step.id)) {
        throw new Error(`Duplicate step ID "${step.id}" in workflow "${name}"`)
      }
      seen.add(step.id)
    }

    const record: WorkflowRecord = {
      steps: steps.map((step) => ({
        step: step as Step,
        anchor: undefined,
        direction: undefined,
        priority: 100,
        insertionOrder: this.globalInsertionCounter++,
        pluginOwner: this.currentPluginOwner,
      })),
      wrappers: new Map(),
      replacements: new Map(),
    }
    this.workflows.set(name, record)

    // Return a typed handle (phantom __brand is never assigned at runtime)
    return { name } as WorkflowHandle<TData>
  }

  addStep(workflow: string, addition: StepAddition, pluginOwner?: string): void {
    const record = this.getRecord(workflow)
    const owner = pluginOwner ?? this.currentPluginOwner

    if (addition.before !== undefined && addition.after !== undefined) {
      throw new Error(`Cannot specify both "before" and "after" in addStep`)
    }

    if (record.steps.some((m) => m.step.id === addition.id)) {
      throw new Error(`Duplicate step ID "${addition.id}" in workflow "${workflow}"`)
    }

    const anchor = addition.before ?? addition.after
    const direction: 'before' | 'after' | undefined =
      addition.before !== undefined ? 'before' : addition.after !== undefined ? 'after' : undefined

    if (anchor !== undefined) {
      const anchorExists = record.steps.some((m) => m.step.id === anchor)
      if (!anchorExists) {
        throw new Error(`Anchor step "${anchor}" not found in workflow "${workflow}"`)
      }
    }

    const newMeta: StepMeta = {
      step: { id: addition.id, critical: addition.critical, run: addition.run as StepFn },
      anchor,
      direction,
      priority: addition.priority ?? 100,
      insertionOrder: this.globalInsertionCounter++,
      pluginOwner: owner,
    }

    const insertIndex = this.findInsertIndex(record.steps, newMeta)
    record.steps.splice(insertIndex, 0, newMeta)
  }

  attachStep(workflow: string, addition: AttachStepAddition, pluginOwner?: string): void {
    const record = this.getRecord(workflow)
    const owner = pluginOwner ?? this.currentPluginOwner

    // Validate the dependency target exists
    const targetExists = record.steps.some((m) => m.step.id === addition.to)
    if (!targetExists) {
      throw new Error(
        `attachStep: dependency target "${addition.to}" not found in workflow "${workflow}"`,
      )
    }

    // Check for circular dependency
    this.checkCircularDependency(record, addition.id, addition.to)

    // Determine positioning: explicit before/after overrides default (after: to)
    const hasExplicitAnchor = addition.before !== undefined || addition.after !== undefined
    const effectiveAddition: StepAddition = {
      id: addition.id,
      critical: addition.critical,
      priority: addition.priority,
      run: addition.run as StepFn,
      ...(hasExplicitAnchor
        ? { before: addition.before, after: addition.after }
        : { after: addition.to }),
    }

    this.addStep(workflow, effectiveAddition, owner)

    // Set dependsOn on the newly added step
    const meta = record.steps.find((m) => m.step.id === addition.id)
    if (meta) {
      meta.dependsOn = addition.to
    }
  }

  wrapStep(
    workflow: string,
    targetStepId: string,
    options: WrapStepOptions,
    pluginOwner?: string,
  ): void {
    const record = this.getRecord(workflow)
    const targetExists = record.steps.some((m) => m.step.id === targetStepId)
    if (!targetExists) {
      throw new Error(`Step "${targetStepId}" not found in workflow "${workflow}"`)
    }

    let entries = record.wrappers.get(targetStepId)
    if (entries === undefined) {
      entries = []
      record.wrappers.set(targetStepId, entries)
    }
    entries.push({
      priority: options.priority ?? 100,
      insertionOrder: this.globalInsertionCounter++,
      run: options.run,
      pluginOwner: pluginOwner ?? this.currentPluginOwner,
    })
    entries.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.insertionOrder - b.insertionOrder
    })
  }

  replaceStep(
    workflow: string,
    targetStepId: string,
    options: ReplaceStepOptions,
    pluginOwner?: string,
  ): void {
    const record = this.getRecord(workflow)
    const meta = record.steps.find((m) => m.step.id === targetStepId)
    if (!meta) {
      throw new Error(`Step "${targetStepId}" not found in workflow "${workflow}"`)
    }

    if (record.replacements.has(targetStepId)) {
      throw new Error(
        `Step "${targetStepId}" in workflow "${workflow}" is already replaced — only one replace per step`,
      )
    }

    record.replacements.set(targetStepId, {
      pluginOwner: pluginOwner ?? this.currentPluginOwner,
      originalRun: meta.step.run,
    })
    meta.step.run = options.run as StepFn
  }

  removeStep(workflow: string, targetStepId: string): void {
    const record = this.getRecord(workflow)
    const idx = record.steps.findIndex((m) => m.step.id === targetStepId)
    if (idx === -1) return // idempotent — already removed (cascade or explicit)
    record.steps.splice(idx, 1)
    record.wrappers.delete(targetStepId)
    record.replacements.delete(targetStepId)

    // Cascade: remove all steps that depend on this step
    const dependants = record.steps
      .filter((m) => m.dependsOn === targetStepId)
      .map((m) => m.step.id)
    for (const depId of dependants) {
      this.removeStep(workflow, depId)
    }
  }

  // ── Plugin lifecycle ──────────────────────────────────────────────────────

  deactivatePlugin(pluginId: string): void {
    for (const [workflowName, record] of this.workflows) {
      // 1. Remove all steps owned by this plugin (triggers cascade)
      const ownedSteps = record.steps.filter((m) => m.pluginOwner === pluginId)
      for (const m of ownedSteps) {
        this.removeStep(workflowName, m.step.id)
      }

      // 2. Remove all wrappers owned by this plugin
      for (const [stepId, entries] of record.wrappers) {
        const filtered = entries.filter((e) => e.pluginOwner !== pluginId)
        if (filtered.length === 0) {
          record.wrappers.delete(stepId)
        } else {
          record.wrappers.set(stepId, filtered)
        }
      }

      // 3. Restore replaced steps owned by this plugin
      for (const [stepId, replacement] of record.replacements) {
        if (replacement.pluginOwner === pluginId) {
          const meta = record.steps.find((m) => m.step.id === stepId)
          if (meta) {
            meta.step.run = replacement.originalRun
          }
          record.replacements.delete(stepId)
        }
      }
    }
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  async runWorkflow(
    name: string,
    ctx: WorkflowContext,
    internal: InternalState,
  ): Promise<WorkflowResult> {
    const record = this.getRecord(name)

    // Zero-step fast path: skip ancestor computation, snapshot, and loop entirely
    if (record.steps.length === 0) {
      return { status: 'completed', data: { ...ctx.state } as WorkflowResult['data'], errors: [] }
    }

    if (internal.depth >= MAX_RECURSION_DEPTH) {
      throw new Error(
        `Recursion depth exceeded: workflow "${name}" would exceed the maximum recursion depth of ${MAX_RECURSION_DEPTH}`,
      )
    }

    internal.depth++
    const errors: StepError[] = []

    // Access state via Proxy (reads go through to _inner) and dataCtrl for restore
    const data = ctx.state
    const { dataCtrl } = internal

    try {
      // Snapshot step list (deep copy StepMeta + Step to prevent replaceStep pierce)
      const steps = record.steps.map((m) => ({ ...m, step: { ...m.step } }))

      // Snapshot wrapper map (shallow copy each entry array to prevent push pierce)
      const wrappersSnapshot = new Map<string, WrapperEntry[]>()
      for (const [k, v] of record.wrappers) {
        wrappersSnapshot.set(k, [...v])
      }

      // Pre-compute ancestor sets for dependsOn failure propagation
      const ancestorsOf = this.computeAncestors(steps)
      const failedSteps = new Set<string>()

      for (const meta of steps) {
        // Check if any ancestor has failed
        const ancestors = ancestorsOf.get(meta.step.id)
        if (ancestors && ancestors.size > 0) {
          let shouldSkip = false
          for (const ancestorId of ancestors) {
            if (failedSteps.has(ancestorId)) {
              shouldSkip = true
              break
            }
          }
          if (shouldSkip) continue
        }

        if (internal.abortCtrl.aborted) break

        // Capture run reference directly (not via closure) since step is a snapshot copy
        const baseFn: StepFn = meta.step.run
        const wrappers = wrappersSnapshot.get(meta.step.id)

        let composedFn: StepFn
        if (!wrappers || wrappers.length === 0) {
          composedFn = baseFn
        } else {
          composedFn = baseFn
          for (let i = wrappers.length - 1; i >= 0; i--) {
            const wrapper = wrappers[i]
            if (wrapper === undefined) continue
            const inner = composedFn
            composedFn = (c: WorkflowContext) => wrapper.run(c, inner)
          }
        }

        if (meta.step.critical !== false) {
          // Critical step — failure propagates immediately
          await composedFn(ctx)
        } else {
          // Non-critical step — snapshot/restore on failure
          let snapshot: Record<string, unknown> | null = null
          try {
            snapshot = structuredClone(dataCtrl.getInner())
          } catch {
            // Cannot clone — degrade to no-restore mode
          }
          try {
            await composedFn(ctx)
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            console.error(`[Workflow] Non-critical step "${meta.step.id}" failed:`, error)
            if (snapshot) {
              dataCtrl.replaceInner(snapshot)
            }
            failedSteps.add(meta.step.id)
            errors.push({ stepId: meta.step.id, error })
          }
        }
      }
    } finally {
      internal.depth--
    }

    return {
      status: internal.abortCtrl.aborted ? 'aborted' : 'completed',
      reason: internal.abortCtrl.reason,
      data: { ...data } as WorkflowResult['data'],
      errors,
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

  /** Pre-compute ancestor sets for dependsOn failure propagation (O(N) with memo) */
  private computeAncestors(steps: StepMeta[]): Map<string, Set<string>> {
    const stepById = new Map<string, StepMeta>()
    for (const meta of steps) {
      stepById.set(meta.step.id, meta)
    }

    const ancestorsOf = new Map<string, Set<string>>()
    const computing = new Set<string>()

    const getAncestors = (stepId: string): Set<string> => {
      const cached = ancestorsOf.get(stepId)
      if (cached) return cached
      if (computing.has(stepId)) {
        const empty = new Set<string>()
        ancestorsOf.set(stepId, empty)
        return empty
      }

      computing.add(stepId)
      const meta = stepById.get(stepId)

      if (!meta?.dependsOn) {
        const empty = new Set<string>()
        ancestorsOf.set(stepId, empty)
        computing.delete(stepId)
        return empty
      }

      const parentAncestors = getAncestors(meta.dependsOn)
      const mine = new Set(parentAncestors)
      mine.add(meta.dependsOn)
      ancestorsOf.set(stepId, mine)
      computing.delete(stepId)
      return mine
    }

    for (const meta of steps) {
      getAncestors(meta.step.id)
    }

    return ancestorsOf
  }

  private checkCircularDependency(
    record: WorkflowRecord,
    newStepId: string,
    dependsOn: string,
  ): void {
    const visited = new Set<string>()
    let current: string | undefined = dependsOn

    while (current) {
      if (current === newStepId) {
        throw new Error(
          `Circular dependency detected: "${newStepId}" → "${dependsOn}" creates a cycle`,
        )
      }
      if (visited.has(current)) break
      visited.add(current)
      const meta = record.steps.find((m) => m.step.id === current)
      current = meta?.dependsOn
    }
  }

  /** Returns true if `a` should be ordered before `b` (lower priority first, then insertion order) */
  private isOrderedBefore(a: StepMeta, b: StepMeta): boolean {
    return (
      a.priority < b.priority || (a.priority === b.priority && a.insertionOrder < b.insertionOrder)
    )
  }

  /**
   * Finds the insertion index for a new step meta entry.
   */
  private findInsertIndex(steps: StepMeta[], newMeta: StepMeta): number {
    if (newMeta.anchor === undefined) {
      let insertAt = steps.length
      for (let i = steps.length - 1; i >= 0; i--) {
        const existing = steps[i]
        if (existing === undefined) continue
        if (existing.anchor === undefined) {
          if (this.isOrderedBefore(existing, newMeta)) {
            insertAt = i + 1
            break
          }
          insertAt = i
        }
      }
      return insertAt
    }

    const anchorIdx = steps.findIndex((m) => m.step.id === newMeta.anchor)

    if (newMeta.direction === 'after') {
      let insertAt = anchorIdx + 1
      for (let i = anchorIdx + 1; i < steps.length; i++) {
        const existing = steps[i]
        if (existing === undefined) break
        if (existing.anchor === newMeta.anchor && existing.direction === 'after') {
          if (this.isOrderedBefore(existing, newMeta)) {
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
      const beforeGroup: number[] = []
      for (let i = 0; i < anchorIdx; i++) {
        const existing = steps[i]
        if (
          existing !== undefined &&
          existing.anchor === newMeta.anchor &&
          existing.direction === 'before'
        ) {
          beforeGroup.push(i)
        }
      }

      if (beforeGroup.length === 0) {
        return anchorIdx
      }

      let insertAt = anchorIdx
      for (let k = beforeGroup.length - 1; k >= 0; k--) {
        const idx = beforeGroup[k]
        if (idx === undefined) continue
        const existing = steps[idx]
        if (existing === undefined) continue
        if (this.isOrderedBefore(existing, newMeta)) {
          insertAt = idx + 1
          break
        }
        insertAt = idx
      }
      return insertAt
    }
  }
}
