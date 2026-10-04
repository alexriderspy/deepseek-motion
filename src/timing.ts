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
    case "flow": return wc(b.title) + b.nodes.reduce((n, x) => n + wc(x), 0) + wc(b.caption);
    case "steps": return wc(b.title) + b.steps.reduce((n, x) => n + wc(x), 0);
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
    case "flow": return 0.25 + b.nodes.length * flowGap(e) + 0.4;
    case "steps": return 0.3 + b.steps.length * stepGap(e) + 0.2;
  }
}

export const flowGap = (e: Energy) => Math.max(0.35, e.enter * 0.6);
export const stepGap = (e: Energy) => Math.max(0.45, e.enter * 0.75);

export function holdTime(b: Beat): number {
  if (b.hold !== undefined) return b.hold;
  return Math.max(MIN_HOLD, readingWords(b) / WORDS_PER_SECOND);
}

// Shortest a hold may be squeezed to when the user asked for a length.
const SQUEEZE_MIN = 0.7;
// How far holds may stretch to fill a longer requested length.
const STRETCH_MAX = 1.8;

export interface Plan {
  durations: number[];
  total: number;
  // Set when the requested duration cannot fit these beats.
  overflow?: { minTotal: number; target: number };
  // Set when even stretched holds fall well short of the requested duration.
  underflow?: { total: number; target: number };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function plan(spec: Pick<Spec, "energy" | "beats" | "duration">): Plan {
  const e = ENERGIES[spec.energy];
  const fixed = spec.beats.map((b) => introTime(b, e) + e.exit);
  let holds = spec.beats.map(holdTime);
  let overflow: Plan["overflow"];
  if (spec.duration) {
    const available = spec.duration - fixed.reduce((a, b) => a + b, 0);
    const natural = holds.reduce((a, b) => a + b, 0);
    // Explicit per-beat holds stay as written; only computed holds flex.
    const flex = spec.beats.map((b) => b.hold === undefined);
    const pinned = holds.reduce((a, h, i) => a + (flex[i] ? 0 : h), 0);
    const flexible = natural - pinned;
    const minTotal = fixed.reduce((a, b) => a + b, 0) + pinned + flex.filter(Boolean).length * SQUEEZE_MIN;
    if (minTotal > spec.duration + 0.5) overflow = { minTotal: round(minTotal), target: spec.duration };
    else if (flexible > 0) {
      const scale = Math.min(STRETCH_MAX, (available - pinned) / flexible);
      holds = holds.map((h, i) => (flex[i] ? Math.max(SQUEEZE_MIN, h * scale) : h));
    }
  }
  const durations = spec.beats.map((_, i) => round(fixed[i] + holds[i]));
  const total = round(durations.reduce((a, b) => a + b, 0));
  const underflow = spec.duration && total < spec.duration * 0.85 ? { total, target: spec.duration } : undefined;
  return { durations, total, overflow, underflow };
}
