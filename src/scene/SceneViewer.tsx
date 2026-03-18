import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, FolderOpen } from 'lucide-react'
import type { Scene } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { ParticleLayer } from './ParticleLayer'
import { useUiStore } from '../stores/uiStore'

interface SceneViewerProps {
  scene: Scene | null
  blurred?: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}

export function SceneViewer({ scene, blurred = false, onContextMenu }: SceneViewerProps) {
  const { t } = useTranslation('scene')
  const setGmDockTab = useUiStore((s) => s.setGmDockTab)
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
        className="w-screen h-screen flex items-center justify-center relative"
        style={{
          backgroundColor: '#2a2420',
          backgroundImage: [
            'radial-gradient(ellipse at 20% 50%, rgba(70,58,42,0.5) 0%, transparent 50%)',
            'radial-gradient(ellipse at 80% 20%, rgba(60,50,38,0.4) 0%, transparent 40%)',
            'radial-gradient(ellipse at 50% 80%, rgba(75,62,45,0.3) 0%, transparent 45%)',
            'radial-gradient(circle at 15% 85%, rgba(55,45,32,0.35) 0%, transparent 30%)',
            'radial-gradient(circle at 70% 60%, rgba(80,65,48,0.2) 0%, transparent 35%)',
            'radial-gradient(ellipse at 40% 30%, rgba(50,40,28,0.4) 0%, transparent 55%)',
          ].join(', '),
        }}
      >
        {blurOverlay}
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <Image size={32} strokeWidth={1} className="text-text-muted/20" />
          {scene && <p className="text-text-muted/40 text-sm">{scene.name}</p>}
          <button
            onClick={() => {
              setGmDockTab('gallery')
            }}
            className="flex items-center gap-1.5 text-text-muted/40 hover:text-text-muted text-xs cursor-pointer transition-colors duration-fast"
          >
            <FolderOpen size={14} strokeWidth={1.5} />
            {t('open_gallery')}
          </button>
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
