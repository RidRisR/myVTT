import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'rgba(var(--color-glass), 0.88)',
        deep: 'var(--color-deep)',
        surface: 'rgba(var(--color-surface), 0.92)',
        'text-primary': 'var(--color-text-primary)',
        'text-muted': 'var(--color-text-muted)',
        'border-glass': 'rgba(var(--color-border-glass), 0.15)',
        hover: 'rgba(255,255,255,0.15)',
        accent: 'var(--color-accent)',
        'accent-bold': 'var(--color-accent-bold)',
        success: '#408040',
        danger: '#C04040',
        warning: '#fbbf24',
        info: '#5090C0',
      },
      zIndex: {
        base: '0',
        tactical: '100',
        ui: '1000',
        popover: '5000',
        overlay: '8000',
        modal: '9000',
        toast: '10000',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 400ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
