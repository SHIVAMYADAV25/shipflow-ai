import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Near-black on off-white, per the frontend PRD's accessibility note
        // (avoids pure #000 on #FFF, which is harsh at high contrast).
        ink: "#111111",
        paper: "#EFEFEF",
        // Single vibrant, non-purple/blue accent used for primary actions only.
        accent: {
          DEFAULT: "#FF5A1F", // orange
          foreground: "#111111",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
    },
  },
  plugins: [],
};

export default config;
