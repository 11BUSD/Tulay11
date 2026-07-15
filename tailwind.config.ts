import type { Config } from "tailwindcss";

/**
 * Tailwind reads design tokens from CSS custom properties defined in
 * `src/app/globals.css`. This keeps a single source of truth for the palette
 * and lets us tweak brand/admin themes without touching component classes.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          dark: "var(--color-brand-dark)",
          soft: "var(--color-brand-soft)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
        },
        gold: {
          DEFAULT: "var(--color-gold)",
          soft: "var(--color-gold-soft)",
        },
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface)",
          alt: "var(--color-surface-alt)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
          muted: "var(--color-ink-muted)",
        },
        line: "var(--color-line)",
        danger: "var(--color-danger)",
        success: "var(--color-success)",
        // Admin theme (clay/amber on a neutral canvas).
        admin: {
          DEFAULT: "var(--color-admin)",
          600: "var(--color-admin-600)",
          "050": "var(--color-admin-050)",
          canvas: "var(--color-admin-canvas)",
          surface: "var(--color-admin-surface)",
          surface2: "var(--color-admin-surface2)",
          border: "var(--color-admin-border)",
          "border-strong": "var(--color-admin-border-strong)",
          ink: "var(--color-admin-ink)",
          "ink-2": "var(--color-admin-ink-2)",
          "ink-3": "var(--color-admin-ink-3)",
          sidebar: "var(--color-admin-sidebar)",
          teal: "var(--color-admin-teal)",
          "teal-050": "var(--color-admin-teal-050)",
          green: "var(--color-admin-green)",
          "green-bg": "var(--color-admin-green-bg)",
          amber: "var(--color-admin-amber)",
          "amber-bg": "var(--color-admin-amber-bg)",
          blue: "var(--color-admin-blue)",
          "blue-bg": "var(--color-admin-blue-bg)",
          red: "var(--color-admin-red)",
          "red-bg": "var(--color-admin-red-bg)",
          slate: "var(--color-admin-slate)",
          "slate-bg": "var(--color-admin-slate-bg)",
          violet: "var(--color-admin-violet)",
          "violet-bg": "var(--color-admin-violet-bg)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
      },
      spacing: {
        "token-1": "var(--space-1)",
        "token-2": "var(--space-2)",
        "token-3": "var(--space-3)",
        "token-4": "var(--space-4)",
      },
    },
  },
  plugins: [],
};

export default config;
