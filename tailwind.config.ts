import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#ffa726",
        secondary: "#ffc725",
        ink: "#0a0a0a",
        surface: "#121212",
      },
      fontFamily: { sans: ["var(--font-montserrat)", "Montserrat", "sans-serif"] },
      backgroundImage: {
        "irf-gradient": "linear-gradient(135deg, #ffa726 0%, #ffc725 100%)",
      },
      boxShadow: {
        glow: "0 0 24px rgba(255, 199, 37, 0.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
