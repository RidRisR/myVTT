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

## Product Design Principles

1. **轻备团优先** — minimal GM preparation overhead
2. **氛围感至上** — atmosphere over mechanical precision
3. **直觉式交互** — zero learning curve
