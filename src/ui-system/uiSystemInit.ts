// src/ui-system/uiSystemInit.ts
import { UIRegistry } from './registry'
import { createDragInitiator } from './LayoutEditor'
import { makeDnDSDK } from './dnd'
import type { IComponentSDK } from './types'
import type { IDataReader, IWorkflowRunner } from '../workflow/types'
import type { AwarenessManager } from './awarenessChannel'

let _uiRegistry: UIRegistry | null = null

export function getUIRegistry(): UIRegistry {
  if (!_uiRegistry) _uiRegistry = new UIRegistry()
  return _uiRegistry
}

/** Reset singletons for test isolation */
export function _resetRegistriesForTesting(): void {
  _uiRegistry = null
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
  const mgr = args.awarenessManager

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
    awareness: mgr
      ? {
          subscribe: (channel, handler) => mgr.subscribe(channel, handler),
          broadcast: (channel, data) => {
            mgr.broadcast(channel, data)
          },
          clear: (channel) => {
            mgr.clear(channel)
          },
        }
      : {
          subscribe: () => () => {},
          broadcast: () => {},
          clear: () => {},
        },
    log: args.logSubscribe ? { subscribe: args.logSubscribe } : { subscribe: () => () => {} },
    ui: args.layoutActions ?? {
      openPanel: () => '',
      closePanel: () => {},
    },
  }
}
