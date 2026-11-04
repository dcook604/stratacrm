import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

/**
 * Colours are exposed through CSS variables so a `.dark` class on <html> can remap the
 * palette without touching any component class names. Light values are Tailwind's defaults,
 * so the default (light) appearance is unchanged.
 */
const HUES = ["slate", "blue", "green", "amber", "red", "purple", "indigo", "orange"] as const;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

// Dark mode shade swaps. Neutrals invert fully. Tinted hues invert their light backgrounds
// (50-300) and dark text shades (700-900) but keep 400-600 so solid buttons and accents stay put.
const SLATE_SWAP: Record<number, number> = { 50: 900, 100: 800, 200: 700, 300: 600, 400: 500, 500: 400, 600: 300, 700: 200, 800: 100, 900: 50 };
const HUE_SWAP: Record<number, number> = { 50: 900, 100: 800, 200: 700, 300: 600, 400: 400, 500: 500, 600: 600, 700: 300, 800: 200, 900: 100 };

type Palette = Record<number, string>;
const palette = (hue: (typeof HUES)[number]) => colors[hue] as unknown as Palette;

function channels(hex: string): string {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

const themed = Object.fromEntries(
  HUES.map((h) => [
    h,
    Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--c-${h}-${s}) / <alpha-value>)`])),
  ]),
);

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ...themed,
        // Card / input / popover background: white in light mode, raised slate in dark mode.
        surface: "rgb(var(--c-surface) / <alpha-value>)",
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const light: Record<string, string> = { "--c-surface": "255 255 255" };
      const dark: Record<string, string> = { "--c-surface": channels(palette("slate")[800]) };
      for (const h of HUES) {
        const swap = h === "slate" ? SLATE_SWAP : HUE_SWAP;
        for (const s of SHADES) {
          light[`--c-${h}-${s}`] = channels(palette(h)[s]);
          dark[`--c-${h}-${s}`] = channels(palette(h)[swap[s]]);
        }
      }
      addBase({
        ":root": light,
        ".dark": { ...dark, "color-scheme": "dark" },
        // Regions that are always dark (sidebar, login screens, toasts) keep the light-mode variables.
        ".dark .keep-dark": light,
      });
    }),
  ],
} satisfies Config;
