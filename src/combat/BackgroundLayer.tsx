import { useEffect, useRef } from 'react'
import { Layer, Image, Text, Rect } from 'react-konva'
import type Konva from 'konva'
import { useTranslation } from 'react-i18next'
import type { TacticalInfo } from '../stores/worldStore'
import { isVideoUrl } from '../shared/assetUpload'
import { useImage } from './useImage'

export function BackgroundLayer({ tacticalInfo }: { tacticalInfo: TacticalInfo }) {
  const { t } = useTranslation('combat')
  const imageUrl = tacticalInfo.mapUrl
  if (!imageUrl) return null // transparent when no tactical map image

  const isVideo = isVideoUrl(imageUrl)

  if (isVideo) {
    return (
      <VideoBackground
        url={imageUrl}
        width={tacticalInfo.mapWidth ?? 0}
        height={tacticalInfo.mapHeight ?? 0}
      />
    )
  }

  return (
    <ImageBackground
      url={imageUrl}
      width={tacticalInfo.mapWidth ?? 0}
      height={tacticalInfo.mapHeight ?? 0}
      loadingText={t('background.loading')}
      noImageText={t('background.no_image')}
    />
  )
}

function ImageBackground({
  url,
  width,
  height,
  loadingText,
  noImageText,
}: {
  url: string
  width: number
  height: number
  loadingText: string
  noImageText: string
}) {
  const [img, status] = useImage(url || undefined)

  return (
    <Layer listening={false}>
      {img && status === 'loaded' ? (
        <Image image={img} x={0} y={0} width={width} height={height} />
      ) : (
        <>
          <Rect x={0} y={0} width={width} height={height} fill="#1a1a2e" />
          <Text
            x={0}
            y={height / 2 - 10}
            width={width}
            text={url ? loadingText : noImageText}
            fontSize={16}
            fill="#666"
            fontFamily="sans-serif"
            align="center"
          />
        </>
      )}
    </Layer>
  )
}

function VideoBackground({ url, width, height }: { url: string; width: number; height: number }) {
  const imageRef = useRef<Konva.Image>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)

  useEffect(() => {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    videoRef.current = video

    video.addEventListener('loadeddata', () => {
      video.play().catch(() => {
        // Autoplay may be blocked
      })
    })

    // Animation loop to redraw the Konva Image each frame
    const animate = () => {
      const layer = imageRef.current?.getLayer()
      if (layer) {
        layer.batchDraw()
      }
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)

    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current)
      }
      video.pause()
      video.src = ''
      videoRef.current = null
    }
  }, [url])

  return (
    <Layer listening={false}>
      {videoRef.current && (
        <Image ref={imageRef} image={videoRef.current} x={0} y={0} width={width} height={height} />
      )}
    </Layer>
  )
}
