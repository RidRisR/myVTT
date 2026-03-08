# Dice Command & Favorites Redesign

**Goal:** Replace `/r` command prefix with `.r`, support no-space syntax (`.rd20`, `.r4d10`), add a favorites system for saving and quick-rolling commonly used formulas.

## 1. Command System

### Format

`.command[space?]args` — extensible command framework. `.r` is the first command.

### Parsing

- Input starting with `.` enters command parsing
- Match against registered commands (currently only `r`)
- Space between command and args is optional
- Detection regex: `^\.r\s*(.+)$` (case-insensitive)

### Examples

```
.rd20+5        → roll "d20+5"
.r4d10         → roll "4d10"
.r 4d6kh3      → roll "4d6kh3"
.r d100        → roll "d100"
.r2d6+@STR     → roll "2d6+@STR" (with variable resolution)
hello world    → plain text message
```

### Changes

- `ChatInput.tsx`: Update roll detection regex from `^\/r\s+(.+)$` to `^\.r\s*(.+)$`
- Update placeholder text to `Type a message or .r 1d20+@STR`
- Error message examples updated accordingly

## 2. Favorites System

### Data

Reuse existing `Character.favorites: DiceFavorite[]`:

```ts
interface DiceFavorite {
  name: string    // Display name, e.g. "攻击骰" or auto-generated "STR Roll"
  formula: string // e.g. "2d6+@STR"
}
```

Storage is per-character via Yjs `players` Y.Map — auto-synced across clients.

### UI: ☆ Button (input bar)

- Position: Left side of input bar, symmetric with ▲/▼ toggle on the right
- Click opens a favorites panel (small floating popover, upward)
- Panel contents:
  - List of saved favorites: name + formula preview
  - Click item → immediately roll (build & send roll message)
  - ✕ button per item for deletion
  - Empty state: hint text
- Click outside closes panel

### UI: Save from dice card

- Hover over a dice result card → ☆ icon fades in at top-right corner
- Click ☆ → save `expression` (original formula with @variables) to favorites
- Name auto-generated via existing `generateFavoriteName()`
- If formula already saved → show ★ (filled), click to remove

### Favorites panel style

- Dark glass theme consistent with project: `rgba(15,15,25,0.92)` + `backdrop-filter: blur(16px)`
- Max height ~200px, scrollable if many items
- Each item: name (white), formula (muted), delete button (hover-visible)

## 3. Component Changes

| Component | Change |
|-----------|--------|
| `ChatInput.tsx` | Regex update, placeholder update, add ☆ button, favorites panel |
| `MessageCard.tsx` | Add hover ☆/★ overlay on dice cards |
| `ChatPanel.tsx` | Pass favorites data + handlers down |
| `diceUtils.ts` | No changes needed |
| `characterTypes.ts` | Already has `favorites?: DiceFavorite[]` |

## 4. Data Flow

### Rolling from favorites

```
User clicks favorite → ChatInput.handleRoll(formula)
  → resolveFormula(formula, tokenProps, seatProps)
  → rollCompound(resolved)
  → onSend(ChatRollMessage)
```

### Saving from card

```
User hovers dice card → ☆ appears
User clicks ☆ → onSaveFavorite(expression)
  → Character.favorites.push({ name: generateFavoriteName(expr), formula: expr })
  → Yjs Y.Map update → synced
```

### Removing favorite

```
User clicks ✕ in panel OR clicks ★ on card
  → onRemoveFavorite(formula)
  → Character.favorites.filter(f => f.formula !== formula)
  → Yjs Y.Map update → synced
```
