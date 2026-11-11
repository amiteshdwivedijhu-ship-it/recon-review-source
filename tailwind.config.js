/** Design tokens live in src/styles/tokens.css. This file only maps them. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Sans"', 'Geist', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        accent: 'var(--color-accent)',
        tint: 'var(--color-tint)',
        'tint-border': 'var(--color-tint-border)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        line: 'var(--color-line)',
        'ok-fg': 'var(--status-ok-fg)',
        'ok-bg': 'var(--status-ok-bg)',
        'ok-line': 'var(--status-ok-line)',
        'warn-fg': 'var(--status-warn-fg)',
        'warn-bg': 'var(--status-warn-bg)',
        'warn-line': 'var(--status-warn-line)',
        'bad-fg': 'var(--status-bad-fg)',
        'bad-bg': 'var(--status-bad-bg)',
        'bad-line': 'var(--status-bad-line)',
        'unknown-fg': 'var(--status-unknown-fg)',
        'unknown-bg': 'var(--status-unknown-bg)',
        'unknown-line': 'var(--status-unknown-line)',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(31,32,35,0.06), 0 4px 16px -8px rgba(31,32,35,0.28)',
        lift: '0 2px 4px rgba(22,21,37,0.12), 0 12px 28px -10px rgba(22,21,37,0.45)',
      },
    },
  },
  plugins: [],
};
