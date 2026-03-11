import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'rgba(20,15,12,0.88)',
        deep: '#140f0c',
        surface: 'rgba(35,28,22,0.92)',
        'text-primary': '#F0E6D8',
        'text-muted': '#A09080',
        'border-glass': 'rgba(180,160,130,0.15)',
        hover: 'rgba(255,255,255,0.15)',
        accent: '#D4A055',
        'accent-bold': '#E8B86A',
        success: '#408040',
        danger: '#C04040',
        warning: '#fbbf24',
        info: '#5090C0',
      },
      zIndex: {
        base: '0',
        combat: '100',
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
