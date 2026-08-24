import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        field: '#14201B',      // deep turf-charcoal background
        panel: '#1C2A22',      // slightly lighter panel green
        'panel-line': '#2A3A30', // hairline dividers within panels
        bell: '#C9A15A',       // brass/bronze accent
        'bell-bright': '#E3BE7A', // hover/active accent
        chalk: '#EDEAE1',      // primary text, off-white
        'chalk-dim': '#9CA89E', // secondary text, muted sage
        brick: '#B5533C'       // "not set" / incomplete state
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      }
    }
  },
  plugins: []
} satisfies Config;
