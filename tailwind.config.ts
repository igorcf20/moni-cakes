import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        brand: {
          orange: "hsl(var(--brand-orange))",
          "orange-2": "hsl(var(--brand-orange-2))",
          "orange-text": "hsl(var(--brand-orange-text))",
          "orange-soft": "hsl(var(--brand-orange-soft))",
          alt: "hsl(var(--brand-alt))",
          "card-border": "hsl(var(--card-border))",
          ink: "hsl(var(--brand-ink))",
          "ink-soft": "hsl(var(--brand-ink-soft))",
          "gold-deep": "hsl(var(--brand-gold-deep))",
          "gold-soft": "hsl(var(--brand-gold-soft))",
          sand: "hsl(var(--brand-sand))",
          navy: "hsl(var(--brand-navy))",
          royal: "hsl(var(--brand-royal))",
          "royal-light": "hsl(var(--brand-royal-light))",
          graphite: "hsl(var(--brand-graphite))",
          ash: "hsl(var(--brand-ash))",
          white: "hsl(var(--brand-white))",
          // Legacy aliases remapped to the new palette so untouched components still render
          "orange-deep": "hsl(var(--brand-navy))",
          yellow: "hsl(var(--brand-royal-light))",
          red: "hsl(var(--destructive))",
          black: "hsl(var(--brand-navy))",
          "black-soft": "hsl(210 60% 10%)",
          "black-border": "hsl(210 40% 18%)",
          gold: "hsl(var(--brand-gold))",
          "gold-dark": "hsl(var(--brand-navy))",
          "gold-muted": "hsl(var(--brand-royal) / 0.6)",
          cream: "hsl(0 0% 100%)",
          "cream-card": "hsl(0 0% 100%)",
          "cream-border": "hsl(210 20% 88%)",
          "cream-muted": "hsl(220 9% 45%)",
          "text-dark": "hsl(0 0% 10%)",
          "text-light": "hsl(0 0% 100%)",
        },
        surface: {
          dark: "hsl(var(--surface-dark))",
          "dark-foreground": "hsl(var(--surface-dark-foreground))",
          navy: "hsl(var(--surface-navy))",
        },
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-hero': 'var(--gradient-hero)',
        'gradient-card': 'var(--gradient-card)',
        'gradient-luxury': 'var(--gradient-luxury)',
        'gradient-fire': 'var(--gradient-fire)',
        'gradient-splash': 'var(--gradient-splash)',
      },
      boxShadow: {
        'soft': 'var(--shadow-soft)',
        'hover': 'var(--shadow-hover)',
        'luxury': 'var(--shadow-luxury)',
        'glow-orange': 'var(--shadow-glow-orange)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        },
        "fade-in-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(20px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        },
        "fade-in-left": {
          "0%": {
            opacity: "0",
            transform: "translateX(-20px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)"
          }
        },
        "fade-in-right": {
          "0%": {
            opacity: "0",
            transform: "translateX(20px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)"
          }
        },
        "scale-in": {
          "0%": {
            transform: "scale(0.95)",
            opacity: "0"
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1"
          }
        },
        "slide-up": {
          "0%": {
            transform: "translateY(100%)",
            opacity: "0"
          },
          "100%": {
            transform: "translateY(0)",
            opacity: "1"
          }
        },
        "slide-down": {
          "0%": {
            transform: "translateY(-20px)",
            opacity: "0"
          },
          "100%": {
            transform: "translateY(0)",
            opacity: "1"
          }
        },
        "zoom-in": {
          "0%": {
            transform: "scale(1)"
          },
          "100%": {
            transform: "scale(1.1)"
          }
        },
        "bounce-soft": {
          "0%, 100%": {
            transform: "translateY(0)"
          },
          "50%": {
            transform: "translateY(-5px)"
          }
        },
        "float": {
          "0%, 100%": {
            transform: "translateY(0)"
          },
          "50%": {
            transform: "translateY(-10px)"
          }
        },
        "subtle-zoom": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(1.1)" }
        },
      },
      animation: {
        "fade-in": "fade-in 0.6s ease-out forwards",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-in-left": "fade-in-left 0.5s ease-out forwards",
        "fade-in-right": "fade-in-right 0.5s ease-out forwards",
        "scale-in": "scale-in 0.4s ease-out forwards",
        "slide-up": "slide-up 0.5s ease-out forwards",
        "slide-down": "slide-down 0.4s ease-out forwards",
        "zoom-in": "zoom-in 0.3s ease-out forwards",
        "bounce-soft": "bounce-soft 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "subtle-zoom": "subtle-zoom 20s ease-in-out infinite alternate",
      },
      fontFamily: {
        // Fontes do tema (variáveis em src/index.css, escritas por src/theme/applyTheme.ts).
        'display': ['var(--font-heading)'],
        'heading': ['var(--font-heading)'],
        'body': ['var(--font-body)'],
        'sans': ['var(--font-body)'],
      },
      transitionProperty: {
        'smooth': 'var(--transition-smooth)',
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
