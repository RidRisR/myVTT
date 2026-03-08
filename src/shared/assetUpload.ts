const API_BASE = import.meta.env.DEV ? 'http://localhost:4444' : ''

export { API_BASE }

const VIDEO_EXTS = /\.(mp4|webm|mov|ogv)$/i

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXTS.test(url)
}

export function getMediaDimensions(url: string): Promise<{ w: number; h: number }> {
  if (isVideoUrl(url)) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => resolve({ w: video.videoWidth, h: video.videoHeight })
      video.onerror = () => resolve({ w: 1920, h: 1080 })
      video.src = url
    })
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 1920, h: 1080 })
    img.src = url
  })
}

export async function uploadAsset(file: File): Promise<string> {
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
  return `${API_BASE}${url}`
}
