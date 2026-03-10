import { useState, useEffect, useRef } from 'react'
import type { Scene } from '../yjs/useScenes'
import { isVideoUrl } from '../shared/assetUpload'

interface SceneViewerProps {
  scene: Scene | null
  onContextMenu?: (e: React.MouseEvent) => void
}

export function SceneViewer({ scene, onContextMenu }: SceneViewerProps) {
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const newUrl = scene?.atmosphereImageUrl ?? null
    if (newUrl === currentUrlRef.current) return

    if (currentUrlRef.current && newUrl) {
      setPrevUrl(currentUrlRef.current)
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
    currentUrlRef.current = newUrl
  }, [scene?.atmosphereImageUrl])

  if (!currentUrl) {
    return (
      <div
        onContextMenu={onContextMenu}
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
          color: '#666',
          fontFamily: 'sans-serif',
          fontSize: 16,
        }}
      >
        No scene selected
      </div>
    )
  }

  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* Previous media (during crossfade) */}
      {prevUrl &&
        (isVideoUrl(prevUrl) ? (
          <video
            src={prevUrl}
            muted
            loop
            autoPlay
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 0,
            }}
          />
        ) : (
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
        ))}
      {/* Current media */}
      {isVideoUrl(currentUrl) ? (
        <video
          key={currentUrl}
          src={currentUrl}
          muted
          loop
          autoPlay
          playsInline
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
          onLoadedData={(e) => {
            if (fading) {
              requestAnimationFrame(() => {
                ;(e.target as HTMLVideoElement).style.opacity = '1'
              })
            }
          }}
        />
      ) : (
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
            if (fading) {
              requestAnimationFrame(() => {
                ;(e.target as HTMLImageElement).style.opacity = '1'
              })
            }
          }}
        />
      )}
    </div>
  )
}
