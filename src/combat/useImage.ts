import { useState, useEffect } from 'react'

type ImageStatus = 'loading' | 'loaded' | 'failed'

export function useImage(url: string | undefined): [HTMLImageElement | null, ImageStatus] {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [status, setStatus] = useState<ImageStatus>('loading')

  useEffect(() => {
    if (!url) {
      setImage(null)
      setStatus('failed')
      return
    }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImage(img)
      setStatus('loaded')
    }
    img.onerror = () => {
      setImage(null)
      setStatus('failed')
    }
    img.src = url
    setStatus('loading')
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [url])

  return [image, status]
}
