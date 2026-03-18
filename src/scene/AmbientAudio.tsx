// src/scene/AmbientAudio.tsx
// Plays ambient audio for the active scene (custom uploaded audio files).
// Crossfades on scene change.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, VolumeX } from 'lucide-react'

interface AmbientAudioProps {
  audioUrl: string | undefined
  volume: number // 0-1
}

const FADE_MS = 1200

export function AmbientAudio({ audioUrl, volume }: AmbientAudioProps) {
  const { t } = useTranslation('scene')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<number>(0)

  const [muted, setMuted] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const hasAudio = !!audioUrl

  // ── Audio file playback ──
  useEffect(() => {
    const old = audioRef.current
    if (old) {
      htmlFadeOut(old, FADE_MS, () => {
        old.pause()
        old.src = ''
      })
      audioRef.current = null
    }

    if (!audioUrl) return

    const next = new Audio(audioUrl)
    next.loop = true
    next.volume = 0
    audioRef.current = next

    next
      .play()
      .then(() => {
        setBlocked(false)
        htmlFadeIn(next, muted ? 0 : volume, FADE_MS)
      })
      .catch(() => {
        setBlocked(true)
      })

    return () => {
      cancelAnimationFrame(fadeRef.current)
      next.pause()
      next.src = ''
      audioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  // ── Volume changes ──
  useEffect(() => {
    const targetVol = muted ? 0 : volume
    if (audioRef.current) {
      audioRef.current.volume = targetVol
    }
  }, [volume, muted])

  // Handle click-to-play when autoplay was blocked
  const handleUnblock = () => {
    const audio = audioRef.current
    if (audio) {
      audio
        .play()
        .then(() => {
          setBlocked(false)
          htmlFadeIn(audio, muted ? 0 : volume, FADE_MS)
        })
        .catch(() => {})
    }
  }

  function htmlFadeIn(el: HTMLAudioElement, targetVol: number, ms: number) {
    const start = performance.now()
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms)
      el.volume = targetVol * t
      if (t < 1) fadeRef.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(fadeRef.current)
    tick()
  }

  function htmlFadeOut(el: HTMLAudioElement, ms: number, onDone: () => void) {
    const start = performance.now()
    const from = el.volume
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms)
      el.volume = from * (1 - t)
      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        onDone()
      }
    }
    tick()
  }

  if (!hasAudio) return null

  return (
    <div
      className="fixed bottom-3 right-4 z-toast flex items-center gap-1.5 font-sans"
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
    >
      {blocked && (
        <button
          onClick={handleUnblock}
          className="rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3 py-2 text-xs font-medium text-accent shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast animate-fade-in"
        >
          {t('click_to_play')}
        </button>
      )}
      <button
        onClick={() => {
          setMuted((m) => !m)
        }}
        className="p-2 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast"
        title={muted ? t('unmute') : t('mute')}
      >
        {muted ? (
          <VolumeX size={14} strokeWidth={1.5} className="text-text-muted" />
        ) : (
          <Volume2 size={14} strokeWidth={1.5} className="text-text-muted" />
        )}
      </button>
    </div>
  )
}
