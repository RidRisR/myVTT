# Chat UI Redesign - Design Document

**Date:** 2026-03-08
**Author:** Claude Sonnet 4.5
**Status:** Approved

## Overview

Redesign the chat and dice rolling UI to provide a collapsible interface with improved visual aesthetics and enhanced dice rolling animations. The new design features a dual-mode system: collapsed mode for minimal distraction and expanded mode for full message history access.

## Problem Statement

The current chat UI has several issues:
1. Always-visible message stack can be distracting when users don't need it
2. Message and card styling lacks visual polish
3. Dice rolling animation feels too fast and lacks suspense
4. No clear visual hierarchy between text messages and dice results

## Design Goals

1. **Collapsible Interface**: Users can minimize the chat to reduce screen clutter
2. **Enhanced Visual Design**: Improved card styling with glass morphism and better contrast
3. **Suspenseful Dice Animation**: Slot machine-style animation with sequential reveals
4. **Smooth Transitions**: Polished enter/exit animations for all UI elements

## User Requirements Summary

- **Expanded State**: Current layout (right-bottom, 420px width) with scrollable message history
- **Collapsed State**: Only input box + toast notifications (max 3 messages, auto-fade after 3s)
- **Message Cards**: Dark glass theme with avatars, enhanced contrast
- **Dice Animation**: Total duration ≤ 2s, all dice spin together, reveal results sequentially
- **Toggle**: Click input to expand, click collapse button to collapse

---

## Architecture

### Component Structure

```
ChatPanel (container)
├─ [expanded] MessageScrollArea
│   ├─ GradientMask (top fade)
│   ├─ ScrollContainer (50vh max)
│   │   └─ MessageCard[] (all history)
│   └─ CollapseButton (top-right)
├─ [collapsed] ToastStack
│   └─ MessageCard[] (max 3, auto-fade)
└─ ChatInput (always visible)
```

### State Management

```typescript
// ChatPanel.tsx
interface ChatPanelState {
  expanded: boolean           // Toggle between modes
  messages: ChatMessage[]     // All messages (from Yjs)
  toastQueue: ToastItem[]     // Toast notifications (collapsed mode)
}

interface ToastItem {
  message: ChatMessage
  timestamp: number           // When added to queue
}
```

### Data Flow

```
User Input → ChatInput.handleSend()
         ↓
    yChat.push([message])  (Yjs sync)
         ↓
    Y.Array.observe()  (all clients)
         ↓
    ┌─── expanded=true ──→ setMessages() → Render to scroll container
    │
    └─── expanded=false ──→ setToastQueue() → Render to toast stack
                                              ↓
                                         Auto-remove after 3s
```

---

## Visual Design

### Message Card Styling

#### Text Message Card

**Styling:**
```typescript
{
  display: 'flex',
  gap: 10,
  padding: '10px 14px',
  background: 'rgba(30, 35, 48, 0.85)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(100, 116, 139, 0.3)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  borderRadius: 10
}
```

**Layout:**
```
┌────────────────────────────────┐
│ 🖼️  PlayerName      14:23      │ ← Avatar + Name + Timestamp
│     Message content...         │ ← Content (left-padded)
└────────────────────────────────┘
```

#### Dice Message Card

**Styling:**
```typescript
{
  display: 'flex',
  gap: 10,
  padding: '12px 16px',
  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.92) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(59, 130, 246, 0.4)',  // Blue border
  boxShadow: '0 4px 16px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(96, 165, 250, 0.1)',
  borderRadius: 12
}
```

**Layout:**
```
┌────────────────────────────────┐
│ 🖼️  PlayerName  /r 1d20+5  14:23│
│     🎲 [17] + [5] = 22         │ ← Dice results with animation
└────────────────────────────────┘
```

### Avatar Design

**Size:** 32×32px, circular

**With Portrait:**
```typescript
<img
  src={portraitUrl}
  style={{
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.15)',
    objectFit: 'cover'
  }}
/>
```

**Fallback (No Portrait):**
```typescript
<div style={{
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: senderColor,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600
}}>
  {senderName[0].toUpperCase()}
</div>
```

---

## Animation System

### Card Lifecycle Animations

#### Collapsed Mode (Toast)

**Enter Animation (0.3s):**
```css
@keyframes toastEnter {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

**Exit Animation (0.4s):**
```css
@keyframes toastExit {
  to {
    opacity: 0;
    transform: translateY(-12px) scale(0.95);
  }
}
```

**Opacity System:**
- Position-based opacity:
  - Index 0 (newest): 1.0
  - Index 1: 0.7
  - Index 2 (oldest): 0.4
- Time-based fade:
  - 0-2s: Full opacity
  - 2-3s: Linear fade to 0
  - 3s: Remove from DOM
- Final opacity = position × time

**Stack Behavior:**
- Max 3 messages
- New message pushes from bottom
- Oldest (top) auto-removes after 3s or when 4th arrives

#### Expanded Mode (Scroll)

**New Message Enter (0.4s):**
```css
@keyframes messageEnter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  60% {
    transform: translateY(0) scale(1.02);  /* Bounce */
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

**Scroll Container:**
```typescript
{
  maxHeight: '50vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column-reverse',  // Newest at bottom
  gap: 8,
  padding: '12px 0',

  // Top gradient mask
  maskImage: 'linear-gradient(to bottom, transparent 0%, black 40px)',
  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40px)',
}
```

**Collapse Button:**
```typescript
{
  position: 'absolute',
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  cursor: 'pointer',
  transition: 'all 0.15s',
}
```

---

## Dice Animation Redesign

### Design Philosophy

Create a slot machine-style experience with:
1. All dice spinning simultaneously
2. Sequential stopping (0.2s intervals)
3. Dramatic total reveal with special effects

### Animation Timeline

**Example: 3d6 roll**

```
Time:   0s ────── 0.8s ──── 1.0s ──── 1.2s ──── 1.4s ──── 1.8s
        │         │         │         │         │         │
Phase:  All spin  Die 1     Die 2     Die 3     Total     Done
        together  stops     stops     stops     reveals

Visual: [🎲🎲🎲] [17🎲🎲] [17 5🎲] [17 5 2] [=24!✨]
```

**Total Duration:** ≤ 2s (1.8s in this example)

### Phase Breakdown

#### Phase 1: Synchronized Spinning (0-0.8s)

**Visual Effect:**
```typescript
// All dice show rapidly changing numbers (every 50ms)
const [displayValue, setDisplayValue] = useState(1)

useEffect(() => {
  const interval = setInterval(() => {
    setDisplayValue(Math.floor(Math.random() * sides) + 1)
  }, 50)
  return () => clearInterval(interval)
}, [sides])
```

**CSS Animation:**
```css
@keyframes diceSpinning {
  0% {
    transform: rotateX(0deg) rotateY(0deg);
    filter: blur(2px);
  }
  100% {
    transform: rotateX(720deg) rotateY(360deg);
    filter: blur(2px);
  }
}

.dice-spinning {
  animation: diceSpinning 0.8s linear infinite;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);  /* Blue glow */
}
```

#### Phase 2: Sequential Stopping (0.8s - 1.4s)

**Stop Timing:**
- Die 1: 0.8s
- Die 2: 1.0s (+0.2s)
- Die 3: 1.2s (+0.2s)
- Die N: 0.8s + (N-1) × 0.2s

**Landing Animation (0.3s):**
```css
@keyframes diceLand {
  0% {
    transform: scale(1) rotateZ(0deg);
    filter: blur(2px);
  }
  50% {
    transform: scale(1.3) rotateZ(10deg);  /* Pop + rotate */
    filter: blur(0);
  }
  70% {
    transform: scale(0.95) rotateZ(-5deg);  /* Bounce back */
  }
  100% {
    transform: scale(1) rotateZ(0deg);
    filter: blur(0);
  }
}

.dice-landing {
  animation: diceLand 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow:
    0 0 20px rgba(59, 130, 246, 0.8),
    inset 0 0 10px rgba(96, 165, 250, 0.4);
}

@keyframes flashPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

#### Phase 3: Total Reveal (1.4s - 1.8s)

**Timing:**
- Wait 0.2s after last die stops
- Total appears with dramatic effect

**Total Animation (0.4s):**
```css
@keyframes totalReveal {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(10px);
  }
  50% {
    transform: scale(1.2) translateY(-2px);  /* Pop up */
  }
  70% {
    transform: scale(0.95) translateY(1px);  /* Settle */
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

**Total Styling:**
```typescript
{
  fontSize: 24,
  fontWeight: 700,
  color: '#fbbf24',  // Gold
  textShadow: `
    0 0 10px rgba(251, 191, 36, 0.8),
    0 0 20px rgba(251, 191, 36, 0.4)
  `,
  animation: 'totalReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
}
```

### DiceReel Component

```typescript
interface DiceReelProps {
  sides: number
  result: number
  stopDelay: number      // When to stop spinning (0.8s, 1.0s, 1.2s...)
  dropped?: boolean
}

const DiceReel: React.FC<DiceReelProps> = ({ sides, result, stopDelay, dropped }) => {
  const [phase, setPhase] = useState<'spinning' | 'landing' | 'stopped'>('spinning')
  const [displayValue, setDisplayValue] = useState(1)

  useEffect(() => {
    // Phase 1: Spinning
    const spinInterval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * sides) + 1)
    }, 50)

    // Phase 2: Stop and land
    const stopTimer = setTimeout(() => {
      clearInterval(spinInterval)
      setDisplayValue(result)
      setPhase('landing')

      setTimeout(() => setPhase('stopped'), 300)
    }, stopDelay * 1000)

    return () => {
      clearInterval(spinInterval)
      clearTimeout(stopTimer)
    }
  }, [stopDelay, result, sides])

  return (
    <div
      className={`dice-reel ${phase === 'spinning' ? 'dice-spinning' : ''} ${phase === 'landing' ? 'dice-landing' : ''}`}
      style={{ opacity: dropped ? 0.5 : 1 }}
    >
      {displayValue}
    </div>
  )
}
```

---

## Implementation Notes

### State Management Details

**Toast Queue Management:**
```typescript
// Auto-cleanup expired toasts
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now()
    setToastQueue(prev =>
      prev.filter(item => now - item.timestamp < 3000)
    )
  }, 1000)
  return () => clearInterval(interval)
}, [])

// Limit to max 3 toasts
useEffect(() => {
  if (toastQueue.length > 3) {
    setToastQueue(prev => prev.slice(-3))
  }
}, [toastQueue.length])

// Clear toasts when expanding
useEffect(() => {
  if (expanded) {
    setToastQueue([])
  }
}, [expanded])
```

**Scroll Behavior:**
```typescript
const scrollRef = useRef<HTMLDivElement>(null)
const [isAtBottom, setIsAtBottom] = useState(true)

// Check if scrolled to bottom
const checkIfAtBottom = () => {
  if (!scrollRef.current) return
  const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
  const atBottom = scrollHeight - scrollTop - clientHeight < 50
  setIsAtBottom(atBottom)
}

// Auto-scroll to bottom when new message arrives (if already at bottom)
useEffect(() => {
  if (expanded && isAtBottom && scrollRef.current) {
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }
}, [messages.length, expanded, isAtBottom])
```

### Performance Considerations

1. **CSS Animations**: Use GPU-accelerated properties (transform, opacity)
2. **Virtual Scrolling**: Not needed yet (message count < 1000)
3. **Debouncing**: Scroll position checks debounced to 100ms
4. **Memoization**: MessageCard components memoized with React.memo()

### Accessibility

1. **Keyboard Navigation**: Tab through messages, Enter to expand/collapse
2. **ARIA Labels**:
   - `aria-expanded` on collapse button
   - `role="log"` on message container
   - `aria-live="polite"` on toast stack
3. **Focus Management**: Input auto-focuses when expanded

---

## Future Enhancements

1. **Sound Effects**: Optional dice roll sound and total reveal chime
2. **Message Search**: Filter messages by sender or content
3. **Pin Messages**: Pin important messages to top
4. **Dice History**: Show recent roll statistics
5. **Custom Animations**: User-selectable animation speed/style

---

## Success Metrics

1. **Visual Polish**: Improved card styling with better contrast and hierarchy
2. **Animation Quality**: Smooth 60fps animations throughout
3. **User Experience**: Clear distinction between collapsed/expanded states
4. **Performance**: No frame drops with 100+ messages
5. **Suspense Factor**: Dice animation feels engaging and dramatic

---

## File Structure

```
src/chat/
├── ChatPanel.tsx              (Main container, state management)
├── MessageScrollArea.tsx      (Expanded mode)
├── ToastStack.tsx             (Collapsed mode)
├── MessageCard.tsx            (Unified card component)
├── DiceResultCard.tsx         (Dice-specific rendering)
├── DiceReel.tsx               (Individual dice animation)
├── ChatInput.tsx              (Input box - minimal changes)
└── chatTypes.ts               (Type definitions - unchanged)
```

---

## Conclusion

This redesign transforms the chat UI from a static always-visible element into a dynamic, collapsible interface with polished animations and enhanced visual design. The slot machine-style dice animation adds excitement to rolls, while the toast notification system keeps users informed without cluttering the screen.

The design maintains backward compatibility with the existing Yjs sync system and requires no changes to the data model or server infrastructure.
