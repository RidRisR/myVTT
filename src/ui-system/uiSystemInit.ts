// src/ui-system/uiSystemInit.ts
import { UIRegistry } from './registry'
import { ExtensionRegistry } from './extensionRegistry'
import { createDragInitiator } from './LayoutEditor'
import { makeDnDSDK } from './dnd'
import type { IComponentSDK } from './types'
import type { IDataReader, IWorkflowRunner } from '../workflow/types'
import type { AwarenessManager } from './awarenessChannel'

let _uiRegistry: UIRegistry | null = null
let _extensionRegistry: ExtensionRegistry | null = null

export function getUIRegistry(): UIRegistry {
  if (!_uiRegistry) _uiRegistry = new UIRegistry()
  return _uiRegistry
}

export function getExtensionRegistry(): ExtensionRegistry {
  if (!_extensionRegistry) _extensionRegistry = new ExtensionRegistry()
  return _extensionRegistry
}

/** Reset singletons for test isolation */
export function _resetRegistriesForTesting(): void {
  _uiRegistry = null
  _extensionRegistry = null
}

interface SDKFactoryArgs {
  instanceKey: string
  instanceProps: Record<string, unknown>
  role: 'GM' | 'Player'
  layoutMode: 'play' | 'edit'
  read: IDataReader
  workflow: IWorkflowRunner
  awarenessManager: AwarenessManager | null
  layoutActions: {
    openPanel(componentId: string, instanceProps?: Record<string, unknown>): string
    closePanel(instanceKey: string): void
  } | null
  logSubscribe: ((pattern: string, handler: (entry: unknown) => void) => () => void) | null
  onDrag?: (instanceKey: string, delta: { dx: number; dy: number }) => void
}

export function createProductionSDK(args: SDKFactoryArgs): IComponentSDK {
  return {
    read: args.read,
    workflow: args.workflow,
    context: {
      instanceProps: args.instanceProps,
      role: args.role,
      layoutMode: args.layoutMode,
    },
    interaction:
      args.layoutMode === 'play'
        ? {
            layout: {
              startDrag: args.onDrag
                ? createDragInitiator(args.instanceKey, args.onDrag)
                : () => {},
            },
            dnd: makeDnDSDK(),
          }
        : undefined,
    awareness: args.awarenessManager
      ? {
          subscribe: (channel, handler) => args.awarenessManager!.subscribe(channel, handler),
          broadcast: (channel, data) => args.awarenessManager!.broadcast(channel, data),
          clear: (channel) => args.awarenessManager!.clear(channel),
        }
      : undefined,
    log: args.logSubscribe ? { subscribe: args.logSubscribe } : undefined,
    ui: args.layoutActions ?? undefined,
  }
}
