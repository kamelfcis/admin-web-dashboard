/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "med-bg": "#050D1D",
        "med-card": "#0C1A30",
        "med-neon": "#38D7FF",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(56,215,255,0.3), 0 20px 45px rgba(56,215,255,0.12)",
      },
    },
  },
  plugins: [],
};
