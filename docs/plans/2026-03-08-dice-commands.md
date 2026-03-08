# Dice Command & Favorites Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `/r` command prefix with `.r` (no-space syntax), add a ☆ favorites system for saving/quick-rolling common formulas from input bar and dice cards.

**Architecture:** Two independent features sharing data via `Character.favorites`. Task 1 changes the command prefix/regex. Tasks 2-4 build the favorites UI: a ☆ button next to chat input opens a floating panel, and a ☆ overlay on dice cards lets users save formulas. Favorites are stored on the active `Character` object via `useCharacters.updateCharacter()`.

**Tech Stack:** React 19, TypeScript, Yjs (Y.Map), inline CSS-in-JS (project convention)

---

### Task 1: Update command prefix from `/r` to `.r`

**Files:**
- Modify: `src/chat/ChatInput.tsx:84` (roll detection regex)
- Modify: `src/chat/ChatInput.tsx:125` (error message)
- Modify: `src/chat/ChatInput.tsx:214` (placeholder)
- Modify: `src/chat/MessageCard.tsx:114` (display prefix in dice card header)

**Step 1: Update roll regex**

In `src/chat/ChatInput.tsx`, line 84, change the roll detection regex:

```typescript
// OLD:
const rollMatch = trimmed.match(/^\/r\s+(.+)$/i)
// NEW:
const rollMatch = trimmed.match(/^\.r\s*(.+)$/i)
```

This changes:
- `/` → `.` prefix
- `\s+` → `\s*` (space is now optional)

**Step 2: Update error message**

In `src/chat/ChatInput.tsx`, line 125, update the example format:

```typescript
// OLD:
setError('Invalid format. Examples: /r 1d20+5, /r 4d6kh3, /r 2d6+@STR')
// NEW:
setError('Invalid format. Examples: .r 1d20+5, .r4d6kh3, .r 2d6+@STR')
```

**Step 3: Update placeholder**

In `src/chat/ChatInput.tsx`, line 214:

```typescript
// OLD:
placeholder="Type a message or /r 1d20+@STR"
// NEW:
placeholder="Type a message or .r 1d20+@STR"
```

**Step 4: Update dice card display prefix**

In `src/chat/MessageCard.tsx`, line 114, update the displayed command prefix:

```typescript
// OLD:
/r {message.expression}
// NEW:
.r {message.expression}
```

**Step 5: Verify and commit**

Run: `cd /Users/zhonghanzhen/Desktop/proj/myVTT/.worktrees/side-dev && npx tsc --noEmit`
Expected: No errors

```bash
git add src/chat/ChatInput.tsx src/chat/MessageCard.tsx
git commit -m "feat: change dice command prefix from /r to .r with optional space"
```

---

### Task 2: Add ☆ favorites button and panel to ChatPanel

This task adds the ☆ button to the left of the chat input, and a floating favorites panel that opens on click.

**Files:**
- Modify: `src/chat/ChatPanel.tsx` (add ☆ button, favorites panel, wire up data)
- Modify: `src/App.tsx:230-237` (pass favorites + handlers to ChatPanel)

**Step 1: Update ChatPanelProps and App.tsx**

In `src/chat/ChatPanel.tsx`, add new props to `ChatPanelProps`:

```typescript
interface ChatPanelProps {
  yDoc: Y.Doc
  senderId: string
  senderName: string
  senderColor: string
  portraitUrl?: string
  seatProperties: { key: string; value: string }[]
  selectedTokenProps?: { key: string; value: string }[]
  favorites: DiceFavorite[]
  onAddFavorite: (fav: DiceFavorite) => void
  onRemoveFavorite: (formula: string) => void
  onRollFormula: (formula: string) => void
}
```

Add imports at the top:
```typescript
import type { DiceFavorite } from '../identity/useIdentity'
```

In `src/App.tsx`, update the ChatPanel usage (around line 230):

```tsx
<ChatPanel
  yDoc={yDoc}
  senderId={mySeatId!}
  senderName={mySeat.name}
  senderColor={mySeat.color}
  portraitUrl={activeCharacter?.imageUrl}
  seatProperties={seatProperties}
  favorites={activeCharacter?.favorites ?? []}
  onAddFavorite={(fav) => {
    if (!activeCharacter) return
    const existing = activeCharacter.favorites ?? []
    if (existing.some(f => f.formula === fav.formula)) return
    updateCharacter(activeCharacter.id, { favorites: [...existing, fav] })
  }}
  onRemoveFavorite={(formula) => {
    if (!activeCharacter) return
    const existing = activeCharacter.favorites ?? []
    updateCharacter(activeCharacter.id, { favorites: existing.filter(f => f.formula !== formula) })
  }}
  onRollFormula={(formula) => {
    // This will be handled inside ChatPanel — it needs to call handleRoll on ChatInput
    // We'll use a ref-based approach in Step 3
  }}
/>
```

Wait — the roll logic is inside ChatInput. We need ChatPanel to be able to trigger a roll from the favorites panel. The cleanest approach: lift `handleRoll` into ChatPanel so both ChatInput and FavoritesPanel can call it.

**Revised approach — lift handleRoll to ChatPanel:**

In `src/chat/ChatInput.tsx`, export the `handleRoll` function separately is complex because it uses onSend and props. Instead, add an `onRollFormula` callback prop to ChatInput that ChatPanel provides, and also give ChatPanel its own ability to construct a roll by passing an `onDirectRoll` callback to the favorites panel.

Actually, the simplest approach: ChatPanel passes `handleRoll` as a prop to ChatInput, and ChatInput calls it. But ChatInput already owns `handleRoll`. Let's keep it simple — add a new `onRollFormula` prop to ChatInput that ChatPanel can also use:

**Better approach:** Add `imperativeRoll` via exposing ChatInput's handleRoll through a ref.

**Simplest approach:** When clicking a favorite, fill the input with `.r <formula>` text and auto-submit. But the user wanted "直接投" (roll immediately).

**Final approach:** Extract roll execution into a shared callback that ChatPanel owns:

In `src/chat/ChatPanel.tsx`, create a `rollFormula` function:

```typescript
import { rollCompound, resolveFormula, generateFavoriteName } from '../shared/diceUtils'

// Inside ChatPanel component:
const rollFormula = useCallback((formula: string) => {
  let expression = formula
  let resolvedExpression = formula

  if (/@[\p{L}\p{N}_]+/u.test(formula)) {
    const resolved = resolveFormula(formula, selectedTokenProps, seatProperties)
    if ('error' in resolved) return // silently fail for favorites
    expression = formula
    resolvedExpression = resolved.resolved
  }

  const result = rollCompound(resolvedExpression)
  if (!result || 'error' in result) return // silently fail

  const id = self.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
  yChat.push([{
    type: 'roll' as const,
    id,
    senderId,
    senderName,
    senderColor,
    portraitUrl,
    expression,
    resolvedExpression: expression !== resolvedExpression ? resolvedExpression : undefined,
    terms: result.termResults,
    total: result.total,
    timestamp: Date.now(),
  }])
}, [selectedTokenProps, seatProperties, senderId, senderName, senderColor, portraitUrl, yChat])
```

**Step 2: Add ☆ button and FavoritesPanel state**

In `src/chat/ChatPanel.tsx`, add state:

```typescript
const [showFavorites, setShowFavorites] = useState(false)
const [favHover, setFavHover] = useState(false)
const favPanelRef = useRef<HTMLDivElement>(null)
const favBtnRef = useRef<HTMLButtonElement>(null)
```

Add click-outside handler:

```typescript
useEffect(() => {
  if (!showFavorites) return
  const handler = (e: PointerEvent) => {
    if (favPanelRef.current?.contains(e.target as Node)) return
    if (favBtnRef.current?.contains(e.target as Node)) return
    setShowFavorites(false)
  }
  document.addEventListener('pointerdown', handler)
  return () => document.removeEventListener('pointerdown', handler)
}, [showFavorites])
```

In the JSX, add the ☆ button to the LEFT of the input (before the `<div style={{ flex: 1 }}>` that wraps ChatInput):

```tsx
{/* ☆ Favorites button */}
<button
  ref={favBtnRef}
  onClick={() => setShowFavorites(v => !v)}
  onMouseEnter={() => setFavHover(true)}
  onMouseLeave={() => setFavHover(false)}
  style={{
    width: 36,
    borderRadius: 10,
    background: favHover || showFavorites
      ? 'rgba(255,255,255,0.18)'
      : 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    color: showFavorites ? '#fbbf24' : 'rgba(255,255,255,0.5)',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
    flexShrink: 0,
  }}
  aria-label="Dice favorites"
>
  {showFavorites ? '★' : '☆'}
</button>
```

**Step 3: Build the FavoritesPanel inline**

Add the favorites panel above the input bar (inside the `<>` fragment, before the bottom bar div):

```tsx
{showFavorites && (
  <div
    ref={favPanelRef}
    style={{
      position: 'fixed',
      bottom: 62,
      right: 16,
      width: 300,
      maxHeight: 240,
      zIndex: 10001,
      background: 'rgba(15, 15, 25, 0.92)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      overflowY: 'auto',
      padding: 8,
    }}
    onPointerDown={(e) => e.stopPropagation()}
  >
    {favorites.length === 0 ? (
      <div style={{
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        textAlign: 'center',
        padding: '16px 8px',
      }}>
        No saved formulas yet.
        Hover over a dice card to save one.
      </div>
    ) : (
      favorites.map((fav, i) => (
        <FavoriteItem
          key={fav.formula + i}
          fav={fav}
          onRoll={() => {
            rollFormula(fav.formula)
            setShowFavorites(false)
          }}
          onRemove={() => onRemoveFavorite(fav.formula)}
        />
      ))
    )}
  </div>
)}
```

**Step 4: Create FavoriteItem sub-component**

Add above the ChatPanel export (or inside the same file):

```tsx
function FavoriteItem({ fav, onRoll, onRemove }: {
  fav: DiceFavorite
  onRoll: () => void
  onRemove: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onRoll}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: hover ? 'rgba(255,255,255,0.08)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fav.name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
          .r {fav.formula}
        </div>
      </div>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.2)',
            border: 'none',
            color: '#ef4444',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
```

**Step 5: Verify and commit**

Run: `npx tsc --noEmit`
Expected: No errors

```bash
git add src/chat/ChatPanel.tsx src/App.tsx
git commit -m "feat: add favorites panel with ☆ button next to chat input"
```

---

### Task 3: Add ☆ save overlay to dice message cards

**Files:**
- Modify: `src/chat/MessageCard.tsx` (add hover ☆/★ overlay on dice cards)

**Step 1: Add props for favorites**

Update `MessageCardProps`:

```typescript
interface MessageCardProps {
  message: ChatMessage
  isNew?: boolean
  animationStyle?: 'toast' | 'scroll'
  isFavorited?: boolean
  onToggleFavorite?: (expression: string) => void
}
```

Update the component signature:

```typescript
export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isNew = false,
  animationStyle = 'scroll',
  isFavorited = false,
  onToggleFavorite,
}) => {
```

**Step 2: Add hover state and ☆ overlay to dice card**

Add hover state inside the component:

```typescript
const [cardHover, setCardHover] = useState(false)
```

Add import:
```typescript
import { useState } from 'react'
```

On the dice card outer div (the one returned in the `// Dice message` section, around line 88), add hover handlers:

```typescript
onMouseEnter={() => setCardHover(true)}
onMouseLeave={() => setCardHover(false)}
```

Also add `position: 'relative'` to the style of the dice card div.

Inside the dice card div, before `<Avatar>`, add the ☆ overlay:

```tsx
{/* Favorite toggle */}
{onToggleFavorite && cardHover && (
  <button
    onClick={(e) => {
      e.stopPropagation()
      onToggleFavorite(message.expression)
    }}
    style={{
      position: 'absolute',
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.4)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: isFavorited ? '#fbbf24' : 'rgba(255,255,255,0.6)',
      fontSize: 14,
      transition: 'color 0.15s',
      zIndex: 1,
    }}
    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
  >
    {isFavorited ? '★' : '☆'}
  </button>
)}
```

**Step 3: Verify and commit**

Run: `npx tsc --noEmit`
Expected: No errors

```bash
git add src/chat/MessageCard.tsx
git commit -m "feat: add ☆/★ favorite overlay on dice message cards"
```

---

### Task 4: Wire favorites through MessageScrollArea and ToastStack

**Files:**
- Modify: `src/chat/MessageScrollArea.tsx` (pass favorites props to MessageCard)
- Modify: `src/chat/ToastStack.tsx` (pass favorites props to MessageCard)
- Modify: `src/chat/ChatPanel.tsx` (pass favorites props down)

**Step 1: Update MessageScrollArea props**

In `src/chat/MessageScrollArea.tsx`, update the interface:

```typescript
interface MessageScrollAreaProps {
  messages: ChatMessage[]
  newMessageIds: Set<string>
  favoritedFormulas: Set<string>
  onToggleFavorite: (expression: string) => void
}
```

Update the component signature to destructure the new props.

Pass them to MessageCard:

```tsx
{messages.map((msg) => (
  <MessageCard
    key={msg.id}
    message={msg}
    isNew={newMessageIds.has(msg.id)}
    animationStyle="scroll"
    isFavorited={msg.type === 'roll' ? favoritedFormulas.has(msg.expression) : false}
    onToggleFavorite={msg.type === 'roll' ? onToggleFavorite : undefined}
  />
))}
```

**Step 2: Update ToastStack**

In `src/chat/ToastStack.tsx`, similarly add the props and pass them to MessageCard (check the file first to see how MessageCard is used there).

**Step 3: Update ChatPanel to pass favorites data down**

In `src/chat/ChatPanel.tsx`, compute the set of favorited formulas:

```typescript
const favoritedFormulas = useMemo(
  () => new Set(favorites.map(f => f.formula)),
  [favorites],
)

const handleToggleFavorite = useCallback((expression: string) => {
  if (favoritedFormulas.has(expression)) {
    onRemoveFavorite(expression)
  } else {
    onAddFavorite({
      name: generateFavoriteName(expression),
      formula: expression,
    })
  }
}, [favoritedFormulas, onAddFavorite, onRemoveFavorite])
```

Add import:
```typescript
import { generateFavoriteName } from '../shared/diceUtils'
```

Pass to MessageScrollArea:

```tsx
<MessageScrollArea
  messages={messages}
  newMessageIds={newMessageIds}
  favoritedFormulas={favoritedFormulas}
  onToggleFavorite={handleToggleFavorite}
/>
```

Pass to ToastStack similarly.

**Step 4: Verify and commit**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npx vite build`
Expected: Build succeeds

```bash
git add src/chat/ChatPanel.tsx src/chat/MessageScrollArea.tsx src/chat/ToastStack.tsx
git commit -m "feat: wire favorites toggle through scroll area and toast stack"
```

---

### Task 5: Manual testing checklist

**Test in browser at localhost:5174:**

1. **Command prefix**: Type `.rd20` and press Enter — should roll d20
2. **Command prefix**: Type `.r 4d6kh3` — should roll with keep highest
3. **Command prefix**: Type `.r4d10` — should roll 4d10
4. **Old prefix**: Type `/r d20` — should send as plain text (no longer a command)
5. **Placeholder**: Input should show `Type a message or .r 1d20+@STR`
6. **Error message**: Type `.r invalid` — error should show `.r` examples
7. **☆ button**: Should appear to the left of input bar
8. **Favorites panel**: Click ☆ — panel opens with "No saved formulas yet"
9. **Save from card**: Hover a dice card — ☆ appears at top-right. Click to save.
10. **Favorites panel populated**: Click ☆ — saved formula appears with name and formula
11. **Roll from favorites**: Click a favorite in the panel — should immediately roll
12. **★ on saved card**: Hover the same dice card — should show ★ (filled). Click to unsave.
13. **Delete from panel**: Hover a favorite in panel — ✕ appears. Click to delete.
14. **Click outside closes**: Click anywhere outside favorites panel — should close
15. **Yjs sync**: Open second browser tab — favorites should sync
