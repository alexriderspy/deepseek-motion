import type { Beat, Spec } from "./spec.ts";
import { ENERGIES, MIN_HOLD, WORDS_PER_SECOND, type Energy } from "./tokens.ts";

// Rhythm is computed, never chosen by the model: entrance time from the
// scene's choreography, hold time from how long the words take to read.

const wc = (s?: string) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);

export function readingWords(b: Beat): number {
  switch (b.scene) {
    case "title": return wc(b.text) + wc(b.kicker);
    case "statement": return wc(b.text);
    case "stat": return 1 + wc(b.label);
    case "list": return wc(b.title) + b.items.reduce((n, it) => n + wc(it), 0);
    case "quote": return wc(b.text) + wc(b.author);
    case "compare": return wc(b.title) + wc(b.left.label) + wc(b.right.label) + wc(b.left.value) + wc(b.right.value);
    case "bars": return wc(b.title) + b.bars.reduce((n, x) => n + wc(x.label) + 1, 0);
    // Code is skimmed, not read word by word.
    case "code": return Math.ceil(b.lines.join(" ").length / 12);
    case "end": return wc(b.text) + wc(b.cta);
  }
}

export const countDuration = (e: Energy) => Math.max(1.2, e.enter * 1.8);

export function introTime(b: Beat, e: Energy): number {
  switch (b.scene) {
    case "title": return 0.15 + wc(b.text) * e.stagger + e.enter;
    case "statement": return wc(b.text) * e.stagger * 0.6 + e.enter + (b.highlight ? 0.5 : 0);
    case "stat": return countDuration(e) + 0.35;
    case "list": return 0.25 + b.items.length * e.stagger * 3 + e.enter;
    case "quote": return e.enter + 0.45;
    case "compare": return e.enter + 0.7;
    case "bars": return 0.2 + b.bars.length * e.stagger * 2 + 1.0;
    case "code": return 0.4 + b.lines.length * 0.32;
    case "end": return e.enter + 0.45;
  }
}

export function holdTime(b: Beat): number {
  if (b.hold !== undefined) return b.hold;
  return Math.max(MIN_HOLD, readingWords(b) / WORDS_PER_SECOND);
}

export function beatDuration(b: Beat, spec: Pick<Spec, "energy">): number {
  const e = ENERGIES[spec.energy];
  const d = introTime(b, e) + holdTime(b) + e.exit;
  return Math.round(d * 100) / 100;
}
