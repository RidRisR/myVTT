import type { TLAssetStore } from 'tldraw'

const UPLOAD_URL = 'http://localhost:4444/api/upload'
const ASSET_BASE = 'http://localhost:4444'

export const assetStore: TLAssetStore = {
  async upload(_asset, file) {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(UPLOAD_URL, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText}`)
    }

    const { url } = await res.json()
    return { src: `${ASSET_BASE}${url}` }
  },

  resolve(asset) {
    return asset.props.src
  },
}
