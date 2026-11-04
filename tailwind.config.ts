import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          DEFAULT: "#FF0033",
          bright: "#FF1744",
          dark: "#D50000",
        },
        surface: {
          base: "#0A0A0A",
          deep: "#121212",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        neon: "0 10px 40px -12px rgba(255, 0, 51, 0.45)",
        "neon-sm": "0 4px 14px -4px rgba(255, 0, 51, 0.35)",
        "neon-lg": "0 20px 60px -20px rgba(255, 0, 51, 0.55)",
        glass: "0 20px 40px -20px rgba(0,0,0,0.6), 0 1px 0 0 rgba(255,255,255,0.03) inset",
        "inner-hl": "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      animation: {
        "fade-up": "fadeUp 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "fade-in": "fadeIn 280ms ease-out both",
        pop: "pop 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        shimmer: "shimmer 2.4s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pop: {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
