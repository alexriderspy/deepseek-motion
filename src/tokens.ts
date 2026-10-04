// The taste lives here. The model only ever picks names from these tables;
// every pixel, millisecond and easing curve comes from this file.

export const FORMATS = {
  "16:9": { width: 1920, height: 1080, safe: { x: 0.07, top: 0.09, bottom: 0.09 } },
  "9:16": { width: 1080, height: 1920, safe: { x: 0.08, top: 0.13, bottom: 0.2 } },
  "1:1": { width: 1080, height: 1080, safe: { x: 0.08, top: 0.08, bottom: 0.08 } },
  "4:5": { width: 1080, height: 1350, safe: { x: 0.08, top: 0.08, bottom: 0.1 } },
} as const;
export type FormatName = keyof typeof FORMATS;

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  // Text drawn on top of an accent fill.
  onAccent: string;
  glow: string;
  description: string;
}

export const PALETTES: Record<string, Palette> = {
  "midnight-lime": {
    bg: "#0b0d10", surface: "#16191f", ink: "#f4f1ea", muted: "#8a8f98",
    accent: "#c6f432", onAccent: "#0b0d10", glow: "#c6f43233",
    description: "near-black with acid lime; edgy launches, hype, showreels",
  },
  "paper-ink": {
    bg: "#f3efe6", surface: "#e8e2d4", ink: "#141414", muted: "#5f5b55",
    accent: "#d4351c", onAccent: "#fbf8f2", glow: "#d4351c22",
    description: "warm paper with red ink; editorial, essays, explainers",
  },
  "electric-blue": {
    bg: "#070b24", surface: "#111840", ink: "#ffffff", muted: "#8e97c7",
    accent: "#3d6bff", onAccent: "#ffffff", glow: "#3d6bff40",
    description: "deep navy with electric blue; AI products, startups, corporate-but-cool",
  },
  "sunset-ember": {
    bg: "#160d09", surface: "#24150e", ink: "#fff3e6", muted: "#b39a88",
    accent: "#ff7a3d", onAccent: "#160d09", glow: "#ff7a3d33",
    description: "dark warm brown with orange; storytelling, lifestyle, emotional",
  },
  "mono-noir": {
    bg: "#000000", surface: "#141414", ink: "#ffffff", muted: "#8c8c8c",
    accent: "#ffffff", onAccent: "#000000", glow: "#ffffff1f",
    description: "pure black and white; minimal, luxury, serious",
  },
  "ultraviolet": {
    bg: "#110b1f", surface: "#1d1433", ink: "#f3eeff", muted: "#a497c4",
    accent: "#b98cff", onAccent: "#110b1f", glow: "#b98cff33",
    description: "deep violet with lavender; developer tools, crypto, futuristic, music",
  },
  "graphite-orange": {
    bg: "#121212", surface: "#1e1e1e", ink: "#f2f2f2", muted: "#9a9a9a",
    accent: "#ff6a1a", onAccent: "#121212", glow: "#ff6a1a2e",
    description: "graphite with safety orange; engineering, systems, trading, hardware",
  },
  "arctic": {
    bg: "#f4f7fb", surface: "#e6ecf5", ink: "#0b1220", muted: "#56627a",
    accent: "#2457e6", onAccent: "#ffffff", glow: "#2457e61f",
    description: "bright white with cobalt; clean explainers, SaaS, docs, teaching",
  },
  "mint-cream": {
    bg: "#eaf4ee", surface: "#d9ece0", ink: "#0e2a1f", muted: "#4a6a5b",
    accent: "#0a7f56", onAccent: "#ffffff", glow: "#0a7f5622",
    description: "soft mint with deep green; health, finance, calm education",
  },
};

export interface TypeFace {
  family: string;
  file: string;
  weight: number;
  style?: "italic";
}

export interface TypePair {
  display: TypeFace;
  body: TypeFace;
  // Display text is uppercase-free by default; tracking tightens big type.
  displayTracking: string;
  description: string;
}

const inter500: TypeFace = { family: "Inter", file: "inter-latin-500-normal.woff2", weight: 500 };

export const TYPE_PAIRS: Record<string, TypePair> = {
  grotesk: {
    display: { family: "Space Grotesk", file: "space-grotesk-latin-700-normal.woff2", weight: 700 },
    body: inter500,
    displayTracking: "-0.035em",
    description: "bold geometric grotesk; confident, modern, tech",
  },
  editorial: {
    display: { family: "Instrument Serif", file: "instrument-serif-latin-400-italic.woff2", weight: 400, style: "italic" },
    body: inter500,
    displayTracking: "-0.015em",
    description: "elegant italic serif; essays, quotes, storytelling",
  },
  "mono-tech": {
    display: { family: "JetBrains Mono", file: "jetbrains-mono-latin-700-normal.woff2", weight: 700 },
    body: { family: "JetBrains Mono", file: "jetbrains-mono-latin-500-normal.woff2", weight: 500 },
    displayTracking: "-0.04em",
    description: "monospace everywhere; only when the video is mostly code or terminals",
  },
  clean: {
    display: { family: "Inter", file: "inter-latin-800-normal.woff2", weight: 800 },
    body: inter500,
    displayTracking: "-0.045em",
    description: "heavy neutral sans; versatile default",
  },
};

export const FONT_SOURCES: Record<string, string> = {
  "Inter": "@fontsource/inter",
  "Space Grotesk": "@fontsource/space-grotesk",
  "Instrument Serif": "@fontsource/instrument-serif",
  "JetBrains Mono": "@fontsource/jetbrains-mono",
};

export interface Energy {
  ease: string;
  // Hero entrance length; supporting elements derive from it.
  enter: number;
  stagger: number;
  exit: number;
  // Distance (in px at 1080 short side) elements travel on entry.
  travel: number;
  description: string;
}

export const ENERGIES: Record<string, Energy> = {
  calm: { ease: "sine.out", enter: 1.1, stagger: 0.14, exit: 0.5, travel: 24, description: "slow and soft; reflective, premium" },
  smooth: { ease: "expo.out", enter: 0.9, stagger: 0.09, exit: 0.4, travel: 48, description: "fluid and polished; the safe default" },
  snappy: { ease: "power4.out", enter: 0.55, stagger: 0.06, exit: 0.3, travel: 64, description: "fast and punchy; shorts, hype, launches" },
  bouncy: { ease: "back.out(1.7)", enter: 0.7, stagger: 0.08, exit: 0.3, travel: 56, description: "playful overshoot; fun, casual, kids" },
};

// Type scale as a fraction of the canvas short side.
export const TYPE_SCALE = {
  hero: 0.13,
  display: 0.095,
  headline: 0.07,
  body: 0.042,
  caption: 0.03,
};

// Reading speed used to hold text on screen long enough to read on a phone.
export const WORDS_PER_SECOND = 3;
export const MIN_HOLD = 1.4;
export const MAX_BEAT = 9;
