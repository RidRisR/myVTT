// src/scene/ParticleLayer.tsx
// Full-screen canvas overlay that renders atmospheric particle effects.

import { useEffect, useRef } from 'react'
import { createParticleEngine, PRESETS } from './particles'
import type { ParticleEngine } from './particles'

interface ParticleLayerProps {
  preset: string
}

export function ParticleLayer({ preset }: ParticleLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ParticleEngine | null>(null)

  // Initialize engine on mount, clean up on unmount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Size canvas to parent
    const parent = canvas.parentElement
    if (parent) {
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
    }

    const engine = createParticleEngine(canvas, preset)
    engineRef.current = engine

    if (PRESETS[preset]) {
      engine.start()
    }

    return () => {
      engine.stop()
      engineRef.current = null
    }
    // Only re-run when preset changes (remounts engine with new config)
     
  }, [preset])

  // Handle resize via ResizeObserver on the parent container
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const parent = canvas.parentElement
    if (!parent) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const dw = Math.round(width)
        const dh = Math.round(height)
        if (dw > 0 && dh > 0) {
          engineRef.current?.resize(dw, dh)
        }
      }
    })

    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  )
}
