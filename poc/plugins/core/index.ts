import type { WorkflowEngine } from '../../../src/workflow/engine'
import { registerCoreWorkflows } from './workflows'

export function activateCorePlugin(engine: WorkflowEngine): void {
  engine.setCurrentPluginOwner('core')
  registerCoreWorkflows(engine)
  engine.setCurrentPluginOwner(undefined)
}
