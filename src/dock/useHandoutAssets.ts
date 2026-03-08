import { useEffect, useState } from 'react'
import * as Y from 'yjs'

export interface HandoutAsset {
  id: string
  title: string
  imageUrl?: string
  content: string
  createdAt: number
}

function readAssets(yMap: Y.Map<HandoutAsset>): HandoutAsset[] {
  const items: HandoutAsset[] = []
  yMap.forEach((item) => items.push(item))
  items.sort((a, b) => a.createdAt - b.createdAt)
  return items
}

export function useHandoutAssets(yDoc: Y.Doc) {
  const yHandouts = yDoc.getMap<HandoutAsset>('handout_assets')
  const [assets, setAssets] = useState<HandoutAsset[]>(() => readAssets(yHandouts))

  useEffect(() => {
    setAssets(readAssets(yHandouts))
    const observer = () => setAssets(readAssets(yHandouts))
    yHandouts.observe(observer)
    return () => yHandouts.unobserve(observer)
  }, [yHandouts])

  const addAsset = (asset: HandoutAsset) => {
    yHandouts.set(asset.id, asset)
  }

  const updateAsset = (id: string, updates: Partial<HandoutAsset>) => {
    const existing = yHandouts.get(id)
    if (existing) {
      yHandouts.set(id, { ...existing, ...updates })
    }
  }

  const deleteAsset = (id: string) => {
    yHandouts.delete(id)
  }

  return { assets, addAsset, updateAsset, deleteAsset }
}
