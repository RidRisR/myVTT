import { useState, useEffect, useRef } from 'react'
import { Image } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { ParticleLayer } from './ParticleLayer'

interface SceneViewerProps {
  scene: Scene | null
  blurred?: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}

export function SceneViewer({ scene, blurred = false, onContextMenu }: SceneViewerProps) {
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  useEffect(() => {
    const newUrl = scene?.atmosphere.imageUrl ?? null
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
  }, [scene?.atmosphere.imageUrl])

  const blurOverlay = (
    <div
      className={`absolute inset-0 z-10 pointer-events-none motion-reduce:duration-0 backdrop-blur-[8px] bg-deep/50 ${
        blurred
          ? 'opacity-100 transition-opacity duration-slow ease-out'
          : 'opacity-0 transition-opacity duration-normal ease-in'
      }`}
    />
  )

  if (!currentUrl) {
    return (
      <div
        onContextMenu={onContextMenu}
        className="w-screen h-screen flex items-center justify-center bg-deep relative"
      >
        {blurOverlay}
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Image size={32} strokeWidth={1} className="text-text-muted/40" />
          <p className="text-text-muted text-sm">No scene selected</p>
          <p className="text-text-muted/50 text-xs">Upload a scene from the asset dock</p>
        </div>
      </div>
    )
  }

  return (
    <div
      onContextMenu={onContextMenu}
      className="bg-deep w-screen h-screen relative overflow-hidden"
    >
      {/* Combat blur + darken overlay — always rendered, opacity transition for smooth enter/exit */}
      {blurOverlay}

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
      {scene?.atmosphere.particlePreset && scene.atmosphere.particlePreset !== 'none' && (
        <ParticleLayer preset={scene.atmosphere.particlePreset} />
      )}
    </div>
  )
}
