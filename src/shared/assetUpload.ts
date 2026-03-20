import { getCurrentRoomId } from './assetApi'
import { API_BASE } from './config'

const VIDEO_EXTS = /\.(mp4|webm|mov|ogv)$/i

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXTS.test(url)
}

export function getMediaDimensions(url: string): Promise<{ w: number; h: number }> {
  if (isVideoUrl(url)) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        resolve({ w: video.videoWidth, h: video.videoHeight })
      }
      video.onerror = () => {
        resolve({ w: 1920, h: 1080 })
      }
      video.src = url
    })
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => {
      resolve({ w: 1920, h: 1080 })
    }
    img.src = url
  })
}

export async function uploadBlueprintFromFile(
  file: File,
  meta?: { name?: string; tags?: string[]; defaults?: Record<string, unknown> },
): Promise<{
  id: string
  name: string
  imageUrl: string
  tags: string[]
  defaults: Record<string, unknown>
  createdAt: number
}> {
  const roomId = getCurrentRoomId()
  const formData = new FormData()
  formData.append('file', file)
  if (meta?.name) formData.append('name', meta.name)
  if (meta?.tags) formData.append('tags', JSON.stringify(meta.tags))
  if (meta?.defaults) formData.append('defaults', JSON.stringify(meta.defaults))

  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/blueprints/from-upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`)
  }

  return (await res.json()) as {
    id: string
    name: string
    imageUrl: string
    tags: string[]
    defaults: Record<string, unknown>
    createdAt: number
  }
}

export async function uploadAsset(
  file: File,
  meta?: {
    name?: string
    mediaType?: string
    category?: string
    tags?: string[]
    extra?: Record<string, unknown>
  },
): Promise<{
  id: string
  url: string
  name: string
  mediaType: string
  category: string
  tags: string[]
  createdAt: number
  extra: Record<string, unknown>
}> {
  const roomId = getCurrentRoomId()
  const formData = new FormData()
  formData.append('file', file)
  if (meta?.name) formData.append('name', meta.name)
  if (meta?.mediaType) formData.append('mediaType', meta.mediaType)
  if (meta?.category) formData.append('category', meta.category)
  if (meta?.tags) formData.append('tags', JSON.stringify(meta.tags))
  if (meta?.extra) formData.append('extra', JSON.stringify(meta.extra))

  const res = await fetch(`${API_BASE}/api/rooms/${roomId}/assets`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`)
  }

  return (await res.json()) as {
    id: string
    url: string
    name: string
    mediaType: string
    category: string
    tags: string[]
    createdAt: number
    extra: Record<string, unknown>
  }
}
