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

## Overlay Components (Radix UI)

All overlays (popovers, context menus, dropdown menus, dialogs) use Radix UI headless primitives via thin wrappers in `src/ui/primitives/`.

**Import rule**: Always import from `src/ui/primitives/`, never directly from `@radix-ui/*`.

| Wrapper               | Radix primitive                 | Built-in protection                                  |
| --------------------- | ------------------------------- | ---------------------------------------------------- |
| `PopoverContent`      | `@radix-ui/react-popover`       | Portal + stopPropagation + z-popover + glass styling |
| `ContextMenuContent`  | `@radix-ui/react-context-menu`  | Portal + glass styling                               |
| `ContextMenuItem`     | `@radix-ui/react-context-menu`  | Item styling + danger variant                        |
| `DropdownMenuContent` | `@radix-ui/react-dropdown-menu` | Portal + glass styling                               |
| `DropdownMenuItem`    | `@radix-ui/react-dropdown-menu` | Item styling + danger variant                        |
| `DialogContent`       | `@radix-ui/react-dialog`        | Portal + overlay + z-modal + focus trap              |

**When to use raw `Popover.Content`**: If the rendered child brings its own container styling (e.g. CharacterCard), use raw `Popover.Content` to avoid style conflicts — but you must add `onPointerDown stopPropagation` yourself.

**Click-outside hook**: `useClickOutside` from `src/hooks/useClickOutside.ts` is Radix Portal-aware. Use it for non-Radix floating panels that coexist with Radix overlays.

**Animation constraint**: Only `opacity` + `scale` in `radix-popover-in` keyframes — no `translate` (conflicts with Radix transform-based positioning).

## Product Design Principles

1. **轻备团优先** — minimal GM preparation overhead
2. **氛围感至上** — atmosphere over mechanical precision
3. **直觉式交互** — zero learning curve
