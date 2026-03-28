// src/workflow/commandRegistry.ts
// Standalone command registry — no circular dependencies.
// Maps chat command names (e.g., '.r', '.dd') to workflow handles.

import type { WorkflowHandle } from './types'

const _commandMap = new Map<string, WorkflowHandle>()

/** Look up a registered command by name (e.g., '.r', '.dd') */
export function getCommand(name: string): WorkflowHandle | undefined {
  return _commandMap.get(name)
}

/** Register a chat command. Called by PluginSDK.registerCommand(). */
export function registerCommand(name: string, handle: WorkflowHandle): void {
  _commandMap.set(name, handle)
}

/** Clear all registered commands. Called by resetWorkflowEngine(). */
export function clearCommands(): void {
  _commandMap.clear()
}
