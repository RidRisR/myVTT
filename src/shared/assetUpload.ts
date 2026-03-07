const API_BASE = import.meta.env.DEV ? 'http://localhost:4444' : ''

export { API_BASE }

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
