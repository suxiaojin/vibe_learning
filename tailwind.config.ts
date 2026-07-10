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
        honey: "#ffc857",
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f8fafc",
          subtle: "#eef4f8"
        },
        "border-soft": "#d9e3ee",
        text: {
          primary: "#18202f",
          secondary: "#64748b",
          muted: "#94a3b8"
        },
        success: {
          DEFAULT: "#58cc02",
          strong: "#45a000",
          muted: "#effbe7"
        },
        warning: {
          DEFAULT: "#f59e0b",
          muted: "#fff7ed"
        },
        info: {
          DEFAULT: "#2563eb",
          muted: "#eff6ff"
        },
        ai: {
          DEFAULT: "#6d5dfc",
          strong: "#5143d8",
          muted: "#f3f1ff"
        }
      },
      borderRadius: {
        card: "1rem",
        panel: "1.375rem"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(24, 32, 47, 0.08)",
        card: "0 18px 50px rgba(15, 23, 42, 0.06)",
        popover: "0 24px 70px rgba(15, 23, 42, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
