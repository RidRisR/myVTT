// src/ui-system/uiSystemInit.ts
import { UIRegistry } from './registry'
import { createDragInitiator } from './LayoutEditor'
import { makeDnDSDK } from './dnd'
import type { IComponentSDK, IRegionSDK, AnchorPoint } from './types'
import type { IDataReader, IWorkflowRunner } from '../workflow/types'
import type { AwarenessManager } from './awarenessChannel'
import type { Entity } from '../shared/entityTypes'
import type { GameLogEntry } from '../shared/logTypes'
import { createReactiveDataSDK, createLogHooks, createAwarenessHooks } from './reactiveHooks'

let _uiRegistry: UIRegistry | null = null

export function getUIRegistry(): UIRegistry {
  if (!_uiRegistry) _uiRegistry = new UIRegistry()
  return _uiRegistry
}

/** Reset singletons for test isolation */
export function _resetRegistriesForTesting(): void {
  _uiRegistry = null
}

export interface SDKFactoryArgs {
  instanceKey: string
  instanceProps: Record<string, unknown>
  role: 'GM' | 'Player'
  layoutMode: 'play' | 'edit'
  read: IDataReader
  workflow: IWorkflowRunner
  awarenessManager: AwarenessManager | null
  layoutActions: {
    openPanel(
      componentId: string,
      instanceProps?: Record<string, unknown>,
      position?: { anchor: AnchorPoint; offsetX?: number; offsetY?: number },
    ): string
    closePanel(instanceKey: string): void
  } | null
  logSubscribe: ((pattern: string, handler: (entry: unknown) => void) => () => void) | null
  onDrag?: (instanceKey: string, delta: { dx: number; dy: number }) => void
  /** Reactive hooks dependencies — if null, no-op hooks are injected */
  getEntities?: () => Record<string, Entity>
  getLogEntries?: () => GameLogEntry[]
  storeSubscribe?: (listener: () => void) => () => void
}

// No-op reactive data SDK for when store dependencies are not provided
const NOOP_DATA_SDK: IComponentSDK['data'] = {
  useEntity: () => undefined,
  useComponent: () => undefined,
  useQuery: () => [],
}

const NOOP_LOG_ENTRIES: IComponentSDK['log']['useEntries'] = () => ({
  entries: [],
  newIds: new Set(),
})

const NOOP_USE_PEERS: IComponentSDK['awareness']['usePeers'] = () => new Map()

export function createProductionSDK(args: SDKFactoryArgs): IComponentSDK {
  const mgr = args.awarenessManager
  const { getEntities, getLogEntries, storeSubscribe } = args

  const dataSDK =
    getEntities && storeSubscribe
      ? createReactiveDataSDK(getEntities, storeSubscribe)
      : NOOP_DATA_SDK

  const logHooks =
    getLogEntries && storeSubscribe ? createLogHooks(getLogEntries, storeSubscribe) : null

  const awarenessHooks = mgr ? createAwarenessHooks(mgr.subscribe.bind(mgr)) : null

  return {
    read: args.read,
    data: dataSDK,
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
          usePeers: awarenessHooks ? awarenessHooks.usePeers : NOOP_USE_PEERS,
        }
      : {
          subscribe: () => () => {},
          broadcast: () => {},
          clear: () => {},
          usePeers: NOOP_USE_PEERS,
        },
    log: args.logSubscribe
      ? { subscribe: args.logSubscribe, useEntries: logHooks?.useEntries ?? NOOP_LOG_ENTRIES }
      : { subscribe: () => () => {}, useEntries: NOOP_LOG_ENTRIES },
    ui: args.layoutActions ?? {
      openPanel: () => '',
      closePanel: () => {},
    },
  }
}

export interface RegionSDKFactoryArgs extends SDKFactoryArgs {
  onResize?: (size: { width?: number; height?: number }) => void
  getPortalContainer?: () => HTMLElement
  minSize?: { width: number; height: number }
}

export function createRegionSDK(args: RegionSDKFactoryArgs): IRegionSDK {
  const base = createProductionSDK(args)
  return {
    ...base,
    ui: {
      openPanel: (regionId, instanceProps, position) => {
        if (!args.layoutActions) return ''
        return args.layoutActions.openPanel(regionId, instanceProps, position)
      },
      closePanel: (instanceKey) => {
        if (!args.layoutActions) return
        args.layoutActions.closePanel(instanceKey)
      },
      resize: (size) => {
        if (!args.onResize) return
        const clamped: { width?: number; height?: number } = {
          width: size.width != null ? Math.max(size.width, args.minSize?.width ?? 0) : undefined,
          height:
            size.height != null ? Math.max(size.height, args.minSize?.height ?? 0) : undefined,
        }
        args.onResize(clamped)
      },
      getPortalContainer: () => {
        return args.getPortalContainer ? args.getPortalContainer() : document.body
      },
    },
  }
}
