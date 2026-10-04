import type { Energy, Palette, TypePair, FORMATS } from "../tokens.ts";
import { TYPE_SCALE } from "../tokens.ts";

export interface Ctx {
  id: string;
  t0: number;
  dur: number;
  intro: number;
  e: Energy;
  // Palette plus accent shades derived to stay readable at small sizes.
  pal: Palette & { accentText: string; accentOnSurface: string };
  type: TypePair;
  fmt: (typeof FORMATS)[keyof typeof FORMATS];
  // Px sizes from TYPE_SCALE for this canvas.
  size: Record<keyof typeof TYPE_SCALE, number>;
  // Usable width inside the safe area.
  availW: number;
  portrait: boolean;
  // Entrance travel distance in px for this canvas.
  travel: number;
}

export interface SceneOut {
  html: string;
  css: string;
  js: string[];
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const r = (n: number) => Math.round(n * 1000) / 1000;

// Emit one GSAP tween line at an absolute timeline position.
export function tw(method: "fromTo" | "to" | "from" | "set", sel: string, a: object, b: object | number | null, at?: number): string {
  const args = [JSON.stringify(sel), JSON.stringify(a)];
  if (b !== null && typeof b === "object") args.push(JSON.stringify(b));
  const pos = typeof b === "number" ? b : at;
  if (pos !== undefined) args.push(String(r(pos)));
  return `tl.${method}(${args.join(", ")});`;
}

// Average glyph width in em for each display family, used to fit text at
// compile time so nothing overflows the safe area.
const GLYPH_EM: Record<string, number> = {
  "Geist": 0.56,
  "Geist Mono": 0.6,
  "Anton": 0.52,
  "Unbounded": 0.74,
  "Instrument Serif": 0.42,
};

export function fitSize(text: string, base: number, availW: number, family: string, maxLines: number): number {
  const k = GLYPH_EM[family] ?? 0.58;
  const longest = Math.max(...text.split(/\s+/).map((w) => w.length), 1);
  const byWord = (availW * 0.94) / (longest * k);
  // Wrapped lines rarely fill edge to edge, so multi-line text gets slack.
  const slack = maxLines === 1 ? 0.95 : 0.75;
  const byLines = (availW * maxLines * slack) / (Math.max(text.length, 1) * k);
  return Math.floor(Math.min(base, byWord, byLines));
}

export interface WordOpts {
  highlight?: string;
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Split text into masked words. Words inside `highlight` are grouped in one
// .hl span carrying a marker that sweeps in behind them.
export function maskedWords(text: string, opts: WordOpts = {}): string {
  const words = text.trim().split(/\s+/);
  let hlStart = -1;
  let hlLen = 0;
  if (opts.highlight) {
    const target = opts.highlight.trim().split(/\s+/).map(norm);
    for (let i = 0; i + target.length <= words.length; i++) {
      if (target.every((t, j) => norm(words[i + j]) === t)) { hlStart = i; hlLen = target.length; break; }
    }
  }
  const one = (w: string) => `<span class="w"><span class="wi">${esc(w)}</span></span>`;
  const parts: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i === hlStart) {
      const group = words.slice(i, i + hlLen).map(one).join(" ");
      parts.push(`<span class="hl"><span class="mark"></span>${group}</span>`);
      i += hlLen - 1;
    } else parts.push(one(words[i]));
  }
  return parts.join(" ");
}

export const fontFace = (f: TypePair["display"]) =>
  `font-family: "${f.family}"; font-weight: ${f.weight}; font-style: ${f.style ?? "normal"}; text-transform: none; letter-spacing: normal;`;
