/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        surface2: 'rgb(var(--color-surface2-rgb) / <alpha-value>)',
        hairline: 'rgb(var(--color-hairline-rgb) / <alpha-value>)',
        ink: 'rgb(var(--color-ink-rgb) / <alpha-value>)',
        muted: 'rgb(var(--color-muted-rgb) / <alpha-value>)',
        faint: 'rgb(var(--color-faint-rgb) / <alpha-value>)',
        failure: 'rgb(var(--color-failure-rgb) / <alpha-value>)',
        ember: 'rgb(var(--color-ember-rgb) / <alpha-value>)',
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        impact: 'rgb(var(--color-impact-rgb) / <alpha-value>)',
        selected: 'rgb(var(--color-selected-rgb) / <alpha-value>)',
        stratum0: 'rgb(var(--color-stratum-0-rgb) / <alpha-value>)',
        stratum1: 'rgb(var(--color-stratum-1-rgb) / <alpha-value>)',
        stratum2: 'rgb(var(--color-stratum-2-rgb) / <alpha-value>)',
        stratum3: 'rgb(var(--color-stratum-3-rgb) / <alpha-value>)',
        stratum4: 'rgb(var(--color-stratum-4-rgb) / <alpha-value>)',
        stratum5: 'rgb(var(--color-stratum-5-rgb) / <alpha-value>)',
        stratum6: 'rgb(var(--color-stratum-6-rgb) / <alpha-value>)',
        stratum7: 'rgb(var(--color-stratum-7-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '2px',
        '2xl': '2px',
      },
    },
  },
  plugins: [],
}
