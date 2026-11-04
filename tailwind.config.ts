import type { Config } from "tailwindcss";

// Colours are CSS variables (light/dark themes). color-mix lets Tailwind's
// opacity modifiers like bg-accent/10 work with them.
const withAlpha = (v: string) => `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: withAlpha("--bg"),
        card: withAlpha("--card"),
        cardhover: withAlpha("--cardhover"),
        border: withAlpha("--border"),
        ink: withAlpha("--ink"),
        muted: withAlpha("--muted"),
        faint: withAlpha("--faint"),
        accent: withAlpha("--accent"),
        accentstrong: withAlpha("--accentstrong"),
        danger: withAlpha("--danger"),
        warn: withAlpha("--warn"),
        good: withAlpha("--good"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 6px -1px rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
