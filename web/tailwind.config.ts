import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Industrial dark base + safety-orange accent.
        // Tightened against live fixmyiron.com when product surfaces ship.
        equipment: {
          950: "#0a0d12",
          900: "#10141b",
          800: "#1a2029",
          700: "#262d38",
          600: "#3a4252",
        },
        accent: {
          DEFAULT: "#ff7a00",
          fg: "#0a0d12",
          hover: "#ff8e26",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
