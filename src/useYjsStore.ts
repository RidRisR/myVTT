import { useEffect, useState } from 'react'
import {
  createTLStore,
  defaultShapeUtils,
  defaultBindingUtils,
  type TLRecord,
} from 'tldraw'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { YKeyValue } from 'y-utility/y-keyvalue'

const WEBSOCKET_URL = 'ws://localhost:4444'
const ROOM_NAME = 'vtt-room-1'

export function useYjsStore() {
  const [store] = useState(() =>
    createTLStore({
      shapeUtils: [...defaultShapeUtils],
      bindingUtils: [...defaultBindingUtils],
    })
  )
  const [yDoc] = useState(() => new Y.Doc())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const yArr = yDoc.getArray<{ key: string; val: TLRecord }>('tl_records')
    const yStore = new YKeyValue(yArr)

    const wsProvider = new WebsocketProvider(WEBSOCKET_URL, ROOM_NAME, yDoc)

    let isSyncing = false

    // Wait for initial sync before loading data
    wsProvider.on('sync', (synced: boolean) => {
      if (!synced) return

      // Load existing data from Yjs into tldraw store
      const existingRecords: TLRecord[] = []
      yStore.yarray.forEach((item) => {
        if (item.val) {
          existingRecords.push(item.val)
        }
      })

      if (existingRecords.length > 0) {
        store.mergeRemoteChanges(() => {
          store.put(existingRecords)
        })
      }

      setIsLoading(false)
    })

    // tldraw → Yjs: sync user operations to Y.Doc
    const unsubscribe = store.listen(
      ({ changes }) => {
        if (isSyncing) return

        yDoc.transact(() => {
          Object.values(changes.added).forEach((record) => {
            yStore.set(record.id, record)
          })
          Object.values(changes.updated).forEach(([_, record]) => {
            yStore.set(record.id, record)
          })
          Object.values(changes.removed).forEach((record) => {
            yStore.delete(record.id)
          })
        })
      },
      { source: 'user', scope: 'document' }
    )

    // Yjs → tldraw: sync remote changes to tldraw store
    const handleYjsChange = (
      changes: Map<
        string,
        { action: 'add' | 'update' | 'delete'; oldValue?: TLRecord; newValue?: TLRecord }
      >,
      transaction: Y.Transaction
    ) => {
      if (transaction.local) return

      isSyncing = true
      const toAdd: TLRecord[] = []
      const toRemove: TLRecord['id'][] = []

      changes.forEach((change, key) => {
        switch (change.action) {
          case 'add':
          case 'update':
            if (change.newValue) {
              toAdd.push(change.newValue)
            }
            break
          case 'delete':
            toRemove.push(key as TLRecord['id'])
            break
        }
      })

      store.mergeRemoteChanges(() => {
        if (toAdd.length > 0) store.put(toAdd)
        if (toRemove.length > 0) store.remove(toRemove)
      })
      isSyncing = false
    }

    yStore.on('change', handleYjsChange)

    return () => {
      unsubscribe()
      yStore.off('change', handleYjsChange)
      wsProvider.destroy()
    }
  }, [store, yDoc])

  return { store, yDoc, isLoading }
}
