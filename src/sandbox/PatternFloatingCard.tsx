import { useCallback, useRef, useState } from 'react'
import { FloatingCard } from '../ui/primitives/FloatingCard'

// ---------------------------------------------------------------------------
// Pattern: FloatingCard — anchored / floating / hover modes
//
// Demonstrates the FloatingCard primitive in three modes:
//   1. Hover preview: dismissOn='mouseleave', anchored below trigger
//   2. Click card: dismissOn='clickoutside', anchored below trigger
//   3. Pinned card: dismissOn='manual', floating + draggable
// ---------------------------------------------------------------------------

export default function PatternFloatingCard() {
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const [clickRect, setClickRect] = useState<DOMRect | null>(null)
  const [pinnedPos, setPinnedPos] = useState<{ x: number; y: number } | null>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHoverTimeout = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current)
      hoverTimeout.current = null
    }
  }

  const handleHoverEnter = useCallback((e: React.MouseEvent) => {
    clearHoverTimeout()
    setHoverRect((e.currentTarget as HTMLElement).getBoundingClientRect())
  }, [])

  const handleHoverLeave = useCallback(() => {
    clearHoverTimeout()
    hoverTimeout.current = setTimeout(() => {
      setHoverRect(null)
    }, 200)
  }, [])

  const handleCardMouseEnter = useCallback(() => {
    clearHoverTimeout()
  }, [])

  const handleCardMouseLeave = useCallback(() => {
    clearHoverTimeout()
    hoverTimeout.current = setTimeout(() => {
      setHoverRect(null)
    }, 200)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setClickRect((prev) => (prev ? null : rect))
  }, [])

  const handlePin = useCallback(() => {
    if (clickRect) {
      setPinnedPos({ x: clickRect.left, y: clickRect.bottom + 8 })
      setClickRect(null)
    }
  }, [clickRect])

  return (
    <div>
      <div className="mb-4 p-4 rounded-lg border border-border-glass bg-glass">
        <h2 className="text-sm font-medium mb-2">FloatingCard</h2>
        <p className="text-xs text-muted leading-relaxed">
          Custom floating card with <code className="text-accent">position: fixed + left/top</code>{' '}
          (no transform). Three modes: hover preview, click card with click-outside dismiss, and
          pinned draggable card.
        </p>
      </div>

      <div className="flex gap-4 items-start">
        {/* Hover trigger */}
        <div
          onMouseEnter={handleHoverEnter}
          onMouseLeave={handleHoverLeave}
          className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-xs text-accent cursor-default"
        >
          H
        </div>

        {/* Click trigger */}
        <button
          onClick={handleClick}
          className="w-12 h-12 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-xs text-accent cursor-pointer"
        >
          C
        </button>

        {/* Status */}
        <div className="text-xs text-muted space-y-1">
          <p>Hover the &quot;H&quot; circle for a hover card</p>
          <p>Click the &quot;C&quot; circle for a click card (then pin it)</p>
          {pinnedPos && <p className="text-accent">Pinned card active — drag it around!</p>}
        </div>
      </div>

      {/* Hover card */}
      {hoverRect && (
        <FloatingCard
          mode="anchored"
          anchor={hoverRect}
          dismissOn="mouseleave"
          onClose={() => {
            setHoverRect(null)
          }}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
          width={200}
        >
          <div className="p-3">
            <p className="text-xs text-text-primary font-medium">Hover Preview</p>
            <p className="text-[10px] text-muted mt-1">
              Closes on mouse leave. Uses anchored mode with dismissOn=&quot;mouseleave&quot;.
            </p>
          </div>
        </FloatingCard>
      )}

      {/* Click card (anchored, click-outside dismiss) */}
      {clickRect && (
        <FloatingCard
          mode="anchored"
          anchor={clickRect}
          dismissOn="clickoutside"
          onClose={() => {
            setClickRect(null)
          }}
          width={240}
        >
          <div className="p-3 space-y-2">
            <p className="text-xs text-text-primary font-medium">Click Card</p>
            <p className="text-[10px] text-muted">
              Closes on click outside. Click &quot;Pin&quot; to convert to draggable.
            </p>
            <button
              onClick={handlePin}
              className="px-2 py-1 rounded text-[10px] bg-accent/20 text-accent border border-accent/30 cursor-pointer hover:bg-accent/30 transition-colors duration-fast"
            >
              Pin
            </button>
          </div>
        </FloatingCard>
      )}

      {/* Pinned card (floating, draggable, manual dismiss) */}
      {pinnedPos && (
        <FloatingCard
          mode="floating"
          position={pinnedPos}
          draggable
          dismissOn="manual"
          onClose={() => {
            setPinnedPos(null)
          }}
          onDragEnd={setPinnedPos}
          width={240}
        >
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-primary font-medium">Pinned Card</p>
              <button
                onClick={() => {
                  setPinnedPos(null)
                }}
                className="text-[10px] text-muted hover:text-text-primary cursor-pointer bg-transparent border-none"
              >
                Close
              </button>
            </div>
            <p className="text-[10px] text-muted">
              Drag any non-interactive area. Does not close on click outside.
            </p>
          </div>
        </FloatingCard>
      )}
    </div>
  )
}
