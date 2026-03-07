import type { TLAssetStore } from 'tldraw'

const API_BASE = import.meta.env.DEV ? 'http://localhost:4444' : ''

export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText}`)
    }

    const { url } = await res.json()
    return { src: url }
  },

  resolve(asset) {
    return asset.props.src
  },
}
