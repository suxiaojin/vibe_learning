import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18202f",
        mist: "#f4f7fb",
        coral: "#ff6b5f",
        teal: "#1f9d8a",
        honey: "#ffc857"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(24, 32, 47, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
