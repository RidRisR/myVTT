# UI Patterns

## Styling

- **Tailwind only** — no inline styles (except dynamic runtime values)
- Design tokens: `bg-glass`, `text-primary`, `text-muted`, `border-glass`, `accent`, `danger`, `success`
- Themes: Warm (default, amber gold) / Cold (blue)
- Target aesthetic: **Alchemy RPG** — dark warm tones, candlelit parchment feel

## z-index Scale

| Layer    | Value |
| -------- | ----- |
| base     | 0     |
| tactical | 100   |
| ui       | 1000  |
| popover  | 5000  |
| overlay  | 8000  |
| modal    | 9000  |
| toast    | 10000 |

## Icons

- Library: Lucide React
- strokeWidth: 1.5
- Sizes: 16 / 20 / 24px

## Radix UI Conventions

### `asChild` requires a real DOM node

Radix's `asChild` merges props onto the child's DOM element. It silently fails if the child is a context provider (e.g. `DropdownMenu.Root`, `Popover.Root`) or Fragment — no error, just broken behavior.

```tsx
// WRONG — DropdownMenu.Root is a context provider, no DOM node
<Popover.Anchor asChild>
  <DropdownMenu.Root>...</DropdownMenu.Root>
</Popover.Anchor>

// CORRECT — wrap in a real DOM element
<Popover.Anchor asChild>
  <div>
    <DropdownMenu.Root>...</DropdownMenu.Root>
  </div>
</Popover.Anchor>
```

### Multi-primitive composition timing

When composing DropdownMenu + Popover (e.g. a menu item that opens a confirm bubble), the DropdownMenu's close sequence dispatches pointer/focus events that the Popover misinterprets as dismiss signals.

Use `ConfirmDropdown` from `src/ui/ConfirmDropdownItem.tsx` — it handles the timing internally:

- `requestAnimationFrame` delays Popover open past DropdownMenu teardown
- `onPointerDownOutside` / `onFocusOutside` are blocked on Popover.Content

### Animation keyframes

Radix uses `transform` for internal positioning. Custom animations must NOT use `translate` — use `opacity` + `scale` only:

```css
@keyframes radix-popover-in {
  from {
    opacity: 0;
    scale: 0.96;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
```

## Product Design Principles

1. **轻备团优先** — minimal GM preparation overhead
2. **氛围感至上** — atmosphere over mechanical precision
3. **直觉式交互** — zero learning curve
