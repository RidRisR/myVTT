import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { useShowcase } from './useShowcase'
import { FocusedCard } from './FocusedCard'
import { PeekCard } from './PeekCard'

const SLOT_SPACING = 140
const SCROLL_SENSITIVITY = 0.008
const SNAP_DELAY = 150
const MAX_VISIBLE_DIST = 3.5
const EPHEMERAL_COLLAPSE_MS = 8000

interface ShowcaseOverlayProps {
  yDoc: Y.Doc
  mySeatId: string
  isGM: boolean
}

export function ShowcaseOverlay({ yDoc, mySeatId, isGM }: ShowcaseOverlayProps) {
  const { items, updateItem, deleteItem, newItemId, clearNewItemId } = useShowcase(yDoc)

  const [scrollY, setScrollY] = useState(0)
  const [isSnapped, setIsSnapped] = useState(false)
  const [animateItemId, setAnimateItemId] = useState<string | null>(null)

  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ephemeralTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // --- New item arrival: scroll to it + trigger entrance animation ---
  useEffect(() => {
    if (!newItemId) return
    const idx = items.findIndex(i => i.id === newItemId)
    if (idx === -1) return

    setAnimateItemId(newItemId)
    // Enable transition so OLD cards slide up, then scroll to new item
    // The new card itself skips CSS transition (handled per-card below)
    setIsSnapped(true)
    requestAnimationFrame(() => setScrollY(idx))
    clearNewItemId()
  }, [newItemId, items])

  // --- Ephemeral auto-collapse ---
  useEffect(() => {
    if (ephemeralTimerRef.current) clearTimeout(ephemeralTimerRef.current)

    const focusedIndex = Math.round(scrollY)
    const focusedItem = items[focusedIndex]
    if (!focusedItem || !focusedItem.ephemeral) return

    ephemeralTimerRef.current = setTimeout(() => {
      // Scroll away from this ephemeral item
      if (items.length <= 1) return // single item, nowhere to go
      const nextIdx = focusedIndex < items.length - 1 ? focusedIndex + 1 : focusedIndex - 1
      setIsSnapped(true)
      requestAnimationFrame(() => setScrollY(nextIdx))
    }, EPHEMERAL_COLLAPSE_MS)

    return () => {
      if (ephemeralTimerRef.current) clearTimeout(ephemeralTimerRef.current)
    }
  }, [scrollY, items])

  // --- Scroll handler ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (items.length <= 1) return
    e.stopPropagation()

    setIsSnapped(false)
    setScrollY(prev => {
      const next = prev + e.deltaY * SCROLL_SENSITIVITY
      return Math.max(0, Math.min(items.length - 1, next))
    })

    // Snap after idle
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
    snapTimerRef.current = setTimeout(() => {
      setIsSnapped(true)
      requestAnimationFrame(() => {
        setScrollY(prev => Math.round(prev))
      })
    }, SNAP_DELAY)
  }, [items.length])

  // Clean up timers
  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
      if (ephemeralTimerRef.current) clearTimeout(ephemeralTimerRef.current)
    }
  }, [])

  // --- Adjust scrollY if items shrink ---
  useEffect(() => {
    if (items.length === 0) return
    setScrollY(prev => Math.min(prev, items.length - 1))
  }, [items.length])

  // --- Actions ---
  const handleDismiss = useCallback((index: number) => {
    // Scroll away (collapse)
    if (items.length <= 1) return
    const nextIdx = index < items.length - 1 ? index + 1 : index - 1
    setIsSnapped(true)
    requestAnimationFrame(() => setScrollY(nextIdx))
  }, [items.length])

  const handlePin = useCallback((id: string) => {
    updateItem(id, { ephemeral: false })
  }, [updateItem])

  const handleDelete = useCallback((id: string) => {
    deleteItem(id)
  }, [deleteItem])

  const handleClickPeek = useCallback((index: number) => {
    setIsSnapped(true)
    requestAnimationFrame(() => setScrollY(index))
  }, [])

  // --- Render nothing if no items ---
  console.log('[ShowcaseOverlay] items:', items.length, 'scrollY:', scrollY, 'animateItemId:', animateItemId)
  if (items.length === 0) return null

  const focusedIndex = Math.round(scrollY)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 15000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Subtle backdrop dimming */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Carousel container — pointerEvents stay 'none', only cards are interactive */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {items.map((item, index) => {
          const dist = index - scrollY
          const absDist = Math.abs(dist)
          if (absDist > MAX_VISIBLE_DIST) return null

          const isFocused = index === focusedIndex
          const y = dist * SLOT_SPACING
          const opacity = Math.max(0.05, 1 - absDist * 0.35)
          const scale = Math.max(0.82, 1 - absDist * 0.06)

          return (
            <div
              key={item.id}
              onWheel={handleWheel}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                transform: `translateY(${y}px) scale(${scale})`,
                opacity,
                transition: (isSnapped && animateItemId !== item.id) ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease' : 'none',
                zIndex: isFocused ? 10 : 5 - Math.floor(absDist),
                pointerEvents: 'auto',
              }}
            >
              {isFocused ? (
                <FocusedCard
                  item={item}
                  isGM={isGM}
                  mySeatId={mySeatId}
                  animateEntrance={animateItemId === item.id}
                  onAnimationDone={() => setAnimateItemId(null)}
                  onDismiss={() => handleDismiss(index)}
                  onPin={() => handlePin(item.id)}
                  onDelete={() => handleDelete(item.id)}
                />
              ) : (
                <PeekCard
                  item={item}
                  onClick={() => handleClickPeek(index)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
