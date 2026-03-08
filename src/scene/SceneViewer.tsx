import { useState, useEffect, useRef } from 'react'
import type { Scene } from '../yjs/useScenes'

interface SceneViewerProps {
  scene: Scene | null
  onContextMenu?: (e: React.MouseEvent) => void
}

export function SceneViewer({ scene, onContextMenu }: SceneViewerProps) {
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const newUrl = scene?.imageUrl ?? null
    if (newUrl === currentUrl) return

    if (currentUrl && newUrl) {
      // Crossfade transition
      setPrevUrl(currentUrl)
      setCurrentUrl(newUrl)
      setFading(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        setPrevUrl(null)
        setFading(false)
      }, 500)
    } else {
      setCurrentUrl(newUrl)
      setPrevUrl(null)
    }
  }, [scene?.imageUrl])

  if (!currentUrl) {
    return (
      <div onContextMenu={onContextMenu} style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        color: '#666',
        fontFamily: 'sans-serif',
        fontSize: 16,
      }}>
        No scene selected
      </div>
    )
  }

  return (
    <div onContextMenu={onContextMenu} style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      background: '#000',
    }}>
      {/* Previous image (during crossfade) */}
      {prevUrl && (
        <img
          src={prevUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
          }}
        />
      )}
      {/* Current image */}
      <img
        src={currentUrl}
        alt={scene?.name ?? ''}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 1,
          opacity: fading ? 0 : 1,
          transition: fading ? 'none' : 'opacity 0.5s ease-in-out',
        }}
        onLoad={(e) => {
          // Fade in after the new image loads
          if (fading) {
            requestAnimationFrame(() => {
              ;(e.target as HTMLImageElement).style.opacity = '1'
            })
          }
        }}
      />
    </div>
  )
}
