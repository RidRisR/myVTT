import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { useShowcase } from './useShowcase'
import { FocusedCard } from './FocusedCard'
import { PeekCard } from './PeekCard'

const SLOT_SPACING = 100
const SCROLL_SENSITIVITY = 0.004
const SNAP_DELAY = 150
const MAX_VISIBLE_DIST = 2.5
const EPHEMERAL_COLLAPSE_MS = 8000

interface ShowcaseOverlayProps {
  yDoc: Y.Doc
  mySeatId: string
  isGM: boolean
}

export function ShowcaseOverlay({ yDoc, mySeatId, isGM }: ShowcaseOverlayProps) {
  const { items, updateItem, deleteItem, newItemId, clearNewItemId, pinnedItemId, pinItem, unpinItem } = useShowcase(yDoc)

  // scrollY as React state (source of truth for rendering)
  // scrollY can go up to items.length — that's the "dismissed" empty slot at queue head
  const [scrollY, setScrollY] = useState(0)
  const [isSnapped, setIsSnapped] = useState(false)
  const [animateItemId, setAnimateItemId] = useState<string | null>(null)

  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ephemeralTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs for smooth scrolling — accumulate delta, flush via rAF
  const scrollYRef = useRef(0)
  const pendingDeltaRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)
  const itemsLenRef = useRef(items.length)
  itemsLenRef.current = items.length
  const pinnedRef = useRef(pinnedItemId)
  pinnedRef.current = pinnedItemId

  // Keep ref in sync when React state changes (snap, new item arrival, etc.)
  useEffect(() => { scrollYRef.current = scrollY }, [scrollY])

  // --- Force scroll to pinned item ---
  useEffect(() => {
    if (!pinnedItemId) return
    const idx = items.findIndex(i => i.id === pinnedItemId)
    if (idx === -1) return
    setIsSnapped(true)
    requestAnimationFrame(() => setScrollY(idx))
  }, [pinnedItemId, items])

  // --- New item arrival: scroll to it + trigger entrance animation ---
  useEffect(() => {
    if (!newItemId) return
    const idx = items.findIndex(i => i.id === newItemId)
    if (idx === -1) return

    // Don't override pin — only scroll to new item if not pinned
    if (!pinnedItemId) {
      setAnimateItemId(newItemId)
      setIsSnapped(true)
      requestAnimationFrame(() => setScrollY(idx))
    }
    clearNewItemId()
  }, [newItemId, items])

  // --- Ephemeral auto-collapse ---
  useEffect(() => {
    if (ephemeralTimerRef.current) clearTimeout(ephemeralTimerRef.current)
    if (pinnedItemId) return // Don't auto-collapse when pinned

    const focusedIndex = Math.round(scrollY)
    const focusedItem = items[focusedIndex]
    if (!focusedItem || !focusedItem.ephemeral) return

    ephemeralTimerRef.current = setTimeout(() => {
      setIsSnapped(true)
      requestAnimationFrame(() => setScrollY(items.length))
    }, EPHEMERAL_COLLAPSE_MS)

    return () => {
      if (ephemeralTimerRef.current) clearTimeout(ephemeralTimerRef.current)
    }
  }, [scrollY, items, pinnedItemId])

  // --- Window-level wheel handler ---
  useEffect(() => {
    if (items.length === 0) return

    const handleWheel = (e: WheelEvent) => {
      // Block scrolling when pinned
      if (pinnedRef.current) {
        e.preventDefault()
        return
      }

      // If wheel event targets a scrollable element, let it scroll naturally
      let el = e.target as HTMLElement | null
      while (el && el !== document.documentElement) {
        const { overflowY } = window.getComputedStyle(el)
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return
        }
        el = el.parentElement
      }

      e.preventDefault()

      const scaled = e.deltaY * SCROLL_SENSITIVITY
      pendingDeltaRef.current = Math.max(-3, Math.min(3, pendingDeltaRef.current + scaled))

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const delta = pendingDeltaRef.current
          pendingDeltaRef.current = 0

          setIsSnapped(false)
          setScrollY(prev => {
            const next = Math.max(0, Math.min(itemsLenRef.current, prev + delta))
            scrollYRef.current = next
            return next
          })
        })
      }

      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
      snapTimerRef.current = setTimeout(() => {
        setIsSnapped(true)
        requestAnimationFrame(() => {
          setScrollY(prev => Math.round(prev))
        })
      }, SNAP_DELAY)
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
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
    setScrollY(prev => Math.min(prev, items.length))
  }, [items.length])

  // --- Actions ---
  const handleDismiss = useCallback(() => {
    if (pinnedItemId) return // Can't dismiss when pinned
    setIsSnapped(true)
    requestAnimationFrame(() => setScrollY(items.length))
  }, [items.length, pinnedItemId])

  const handlePin = useCallback((id: string) => {
    pinItem(id)
  }, [pinItem])

  const handleUnpin = useCallback(() => {
    unpinItem()
  }, [unpinItem])

  const handleDelete = useCallback((id: string) => {
    deleteItem(id)
  }, [deleteItem])

  const handleClickPeek = useCallback((index: number) => {
    if (pinnedItemId) return // Can't switch when pinned
    setIsSnapped(true)
    requestAnimationFrame(() => setScrollY(index))
  }, [pinnedItemId])

  // --- Render nothing if no items ---
  if (items.length === 0) return null

  const focusedIndex = Math.round(scrollY)
  const isDismissedView = focusedIndex >= items.length
  const isPinned = !!pinnedItemId

  return (
    <div
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
      {/* Subtle backdrop dimming — fade out when dismissed */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)',
        pointerEvents: 'none',
        opacity: isDismissedView ? 0 : 1,
        transition: isSnapped ? 'opacity 0.3s ease' : 'none',
      }} />

      {/* Carousel container */}
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
          if (dist > 0.5) return null

          const isFocused = index === focusedIndex && !isDismissedView
          const QUEUE_GAP = 160
          const y = isFocused ? 0 : (dist * SLOT_SPACING - QUEUE_GAP)
          const opacity = isFocused ? 1 : (isSnapped ? 0 : Math.max(0.05, 1 - absDist * 0.4))
          const scale = isFocused ? 1 : Math.max(0.78, 1 - absDist * 0.08)

          return (
            <div
              key={item.id}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                transform: `translateY(${y}px) scale(${scale})`,
                opacity,
                transition: (isSnapped && animateItemId !== item.id)
                  ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease'
                  : 'none',
                zIndex: isFocused ? 10 : 5 - Math.floor(absDist),
                pointerEvents: 'auto',
              }}
            >
              {isFocused ? (
                <FocusedCard
                  item={item}
                  isGM={isGM}
                  mySeatId={mySeatId}
                  isPinned={isPinned}
                  animateEntrance={animateItemId === item.id}
                  onAnimationDone={() => setAnimateItemId(null)}
                  onDismiss={handleDismiss}
                  onPin={() => handlePin(item.id)}
                  onUnpin={handleUnpin}
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
