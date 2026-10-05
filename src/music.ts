import { writeFileSync } from "node:fs";

// A small offline synth that scores each video: no account, no network, no
// licensing, and the same track on every render. Style follows the video's
// energy; key and progression vary with the title. A soft whoosh lands on
// every scene cut so the music feels cut to picture.

const SR = 44100;

type Style = "calm" | "smooth" | "snappy" | "bouncy";

interface Plan {
  bpm: number;
  swing: number;
  // Semitone offsets from the key root, one chord per bar (or two bars when slow).
  chords: number[][];
  barsPerChord: number;
}

const PROGRESSIONS: Record<Style, number[][][]> = {
  calm: [
    [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16, 19], [7, 11, 14, 17]],
    [[0, 4, 7, 14], [9, 12, 16, 19], [5, 9, 12, 16], [7, 12, 14, 19]],
  ],
  smooth: [
    [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]],
    [[5, 9, 12, 16], [4, 7, 11, 14], [2, 5, 9, 12], [0, 4, 7, 11]],
  ],
  snappy: [
    [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 21]],
    [[0, 3, 7, 12], [10, 14, 17, 22], [8, 12, 15, 20], [7, 11, 14, 19]],
  ],
  bouncy: [
    [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]],
    [[0, 4, 7, 12], [5, 9, 12, 17], [7, 11, 14, 19], [5, 9, 12, 17]],
  ],
};

const BPM: Record<Style, number> = { calm: 76, smooth: 84, snappy: 122, bouncy: 108 };
const ROOTS = [45, 48, 50, 43, 41, 47]; // A2 C3 D3 G2 F2 B2

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Mono buffers mixed into stereo at the end.
class Bus {
  l: Float32Array;
  r: Float32Array;
  constructor(n: number) { this.l = new Float32Array(n); this.r = new Float32Array(n); }
  add(i: number, v: number, pan = 0) {
    if (i < 0 || i >= this.l.length) return;
    this.l[i] += v * (1 - Math.max(0, pan));
    this.r[i] += v * (1 + Math.min(0, pan));
  }
}

function kick(bus: Bus, t: number, gain: number) {
  const i0 = Math.round(t * SR);
  let ph = 0;
  for (let k = 0; k < SR * 0.45; k++) {
    const s = k / SR;
    const f = 45 + 110 * Math.exp(-s * 28);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-s * 7.5);
    bus.add(i0 + k, Math.tanh(Math.sin(ph) * 1.6) * env * gain);
  }
}

function noiseHit(bus: Bus, t: number, gain: number, decay: number, bright: number, rnd: () => number, pan = 0, tone = 0) {
  const i0 = Math.round(t * SR);
  let lp = 0, prev = 0;
  for (let k = 0; k < SR * Math.min(0.6, 6 / decay); k++) {
    const s = k / SR;
    const n = rnd() * 2 - 1;
    lp += (n - lp) * bright;
    const hp = n - lp; // crude high-pass: what the low-pass removed
    const body = tone ? Math.sin(2 * Math.PI * tone * s) * Math.exp(-s * 30) * 0.6 : 0;
    const v = (hp * 0.8 + prev * 0.2 + body) * Math.exp(-s * decay) * gain;
    prev = hp;
    bus.add(i0 + k, v, pan);
  }
}

function clap(bus: Bus, t: number, gain: number, rnd: () => number) {
  for (const d of [0, 0.011, 0.023]) noiseHit(bus, t + d, gain * (d ? 0.6 : 1), 22, 0.25, rnd, 0, 0);
}

// Electric-piano-ish tone: a sine with a decaying FM shimmer.
function keys(bus: Bus, t: number, dur: number, midi: number, gain: number, pan: number) {
  const i0 = Math.round(t * SR), f = hz(midi);
  const n = Math.round((dur + 0.6) * SR);
  for (let k = 0; k < n; k++) {
    const s = k / SR;
    const env = Math.min(1, s / 0.01) * Math.exp(-s * 1.6) * (s > dur ? Math.exp(-(s - dur) * 8) : 1);
    const mod = Math.sin(2 * Math.PI * f * 2 * s) * 1.2 * Math.exp(-s * 5);
    bus.add(i0 + k, Math.sin(2 * Math.PI * f * s + mod) * env * gain, pan);
  }
}

// Soft pad: detuned triangles, slow attack, gentle low-pass.
function pad(bus: Bus, t: number, dur: number, midi: number, gain: number, pan: number, attack = 0.6) {
  const i0 = Math.round(t * SR), f = hz(midi);
  const n = Math.round((dur + 1.2) * SR);
  let lp = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR;
    const env = Math.min(1, s / attack) * (s > dur ? Math.exp(-(s - dur) * 3) : 1);
    let v = 0;
    for (const d of [-0.07, 0, 0.06]) {
      const x = (f * Math.pow(2, d / 12) * s) % 1;
      v += 4 * Math.abs(x - 0.5) - 1;
    }
    lp += (v / 3 - lp) * 0.12;
    bus.add(i0 + k, lp * env * gain, pan);
  }
}

// Plucked string (Karplus-Strong): warm, cheap, sounds real.
function pluck(bus: Bus, t: number, midi: number, gain: number, pan: number, rnd: () => number, damp = 0.996) {
  const i0 = Math.round(t * SR);
  const period = Math.max(2, Math.round(SR / hz(midi)));
  const buf = new Float32Array(period);
  for (let k = 0; k < period; k++) buf[k] = rnd() * 2 - 1;
  // Smooth the excitation so the attack is a soft pluck, not a click.
  for (let pass = 0; pass < 3; pass++) for (let k = 1; k < period; k++) buf[k] = (buf[k] + buf[k - 1]) * 0.5;
  let idx = 0;
  for (let k = 0; k < SR * 1.6; k++) {
    const next = (idx + 1) % period;
    const v = buf[idx];
    buf[idx] = (v + buf[next]) * 0.5 * damp;
    idx = next;
    bus.add(i0 + k, v * gain * Math.min(1, k / 40), pan);
  }
}

function bass(bus: Bus, t: number, dur: number, midi: number, gain: number, bright = 0) {
  const i0 = Math.round(t * SR), f = hz(midi);
  let lp = 0;
  for (let k = 0; k < Math.round((dur + 0.08) * SR); k++) {
    const s = k / SR;
    const env = Math.min(1, s / 0.005) * (s > dur ? Math.exp(-(s - dur) * 60) : 1) * (bright ? Math.exp(-s * 3) * 0.6 + 0.4 : 1);
    const saw = 2 * ((f * s) % 1) - 1;
    const v = bright ? saw : Math.sin(2 * Math.PI * f * s) + 0.25 * Math.sin(4 * Math.PI * f * s);
    lp += (v - lp) * (bright ? 0.04 + 0.2 * Math.exp(-s * 12) : 0.5);
    bus.add(i0 + k, Math.tanh(lp * 1.4) * env * gain);
  }
}

// Rising filtered noise into a cut, then a soft low thump on it.
function whoosh(bus: Bus, t: number, gain: number, rnd: () => number, thump: boolean) {
  const len = 0.55;
  const i0 = Math.round((t - len) * SR);
  let lp = 0;
  for (let k = 0; k < len * SR; k++) {
    const x = k / (len * SR);
    lp += (rnd() * 2 - 1 - lp) * (0.02 + 0.3 * x * x);
    bus.add(i0 + k, lp * Math.pow(x, 2.2) * gain * 1.8, Math.sin(x * 3) * 0.4);
  }
  if (thump) {
    const j0 = Math.round(t * SR);
    for (let k = 0; k < SR * 0.5; k++) {
      const s = k / SR;
      bus.add(j0 + k, Math.sin(2 * Math.PI * (38 + 40 * Math.exp(-s * 20)) * s) * Math.exp(-s * 6) * gain * 0.9);
    }
  }
}

// Schroeder reverb on a send bus; different comb lengths per side give width.
function reverb(src: Bus, n: number, mix: number): Bus {
  const out = new Bus(n);
  const side = (input: Float32Array, dest: Float32Array, combs: number[], aps: number[]) => {
    const tmp = new Float32Array(n);
    for (const len of combs) {
      const buf = new Float32Array(len);
      let idx = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx];
        lp = y * 0.75 + lp * 0.25;
        buf[idx] = input[i] + lp * 0.8;
        tmp[i] += y;
        idx = (idx + 1) % len;
      }
    }
    for (const len of aps) {
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx];
        const y = -tmp[i] + b;
        buf[idx] = tmp[i] + b * 0.5;
        tmp[i] = y;
        idx = (idx + 1) % len;
      }
    }
    for (let i = 0; i < n; i++) dest[i] = tmp[i] * mix * 0.25;
  };
  side(src.l, out.l, [1557, 1617, 1491, 1422], [225, 556]);
  side(src.r, out.r, [1580, 1640, 1514, 1445], [248, 579]);
  return out;
}

export interface MusicOptions {
  duration: number;
  energy: string;
  seed: number;
  cuts: number[];
}

export function compose(o: MusicOptions): { l: Float32Array; r: Float32Array } {
  const style = (["calm", "smooth", "snappy", "bouncy"].includes(o.energy) ? o.energy : "smooth") as Style;
  const rnd = seeded(o.seed);
  const progs = PROGRESSIONS[style];
  const plan: Plan = {
    bpm: BPM[style],
    swing: style === "smooth" ? 0.58 : 0.5,
    chords: progs[Math.floor(rnd() * progs.length)],
    barsPerChord: style === "calm" ? 2 : 1,
  };
  const root = ROOTS[Math.floor(rnd() * ROOTS.length)];
  const n = Math.ceil((o.duration + 0.5) * SR);
  const dry = new Bus(n), wet = new Bus(n), drums = new Bus(n), sc = new Float32Array(n).fill(1);
  const beat = 60 / plan.bpm, bar = beat * 4;
  const bars = Math.ceil(o.duration / bar) + 1;
  // Intro: first bar without drums or bass, so the opening breathes.
  const introBars = o.duration > 8 ? 1 : 0;
  const sw = (x: number) => (Math.floor(x * 2) % 2 === 1 ? Math.floor(x) + plan.swing : x); // 8th-note swing

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    if (t0 > o.duration) break;
    const chord = plan.chords[Math.floor(b / plan.barsPerChord) % plan.chords.length];
    const notes = chord.map((iv) => root + 12 + iv);
    const full = b >= introBars;

    if (style === "calm") {
      if (b % plan.barsPerChord === 0) notes.forEach((m, k) => pad(wet, t0, bar * plan.barsPerChord, m + 12, 0.07, (k - 1.5) * 0.3, 1.4));
      for (let s = 0; s < 4; s++) if (rnd() < 0.55) pluck(wet, t0 + s * beat + beat * 0.5 * (rnd() < 0.3 ? 1 : 0), notes[Math.floor(rnd() * 4)] + 24, 0.12, rnd() - 0.5, rnd);
      if (full && b % plan.barsPerChord === 0) bass(dry, t0, bar * plan.barsPerChord - 0.1, root + chord[0] - 12, 0.22);
    }

    if (style === "smooth") {
      notes.forEach((m, k) => keys(wet, t0 + k * 0.018, bar * 0.9, m + 12, 0.07, (k - 1.5) * 0.25));
      if (full) {
        kick(drums, t0, 0.7); kick(drums, t0 + sw(2.5) * beat, 0.55);
        noiseHit(drums, t0 + beat, 0.28, 18, 0.35, rnd, 0, 190); noiseHit(drums, t0 + 3 * beat, 0.28, 18, 0.35, rnd, 0, 190);
        for (let e = 0; e < 8; e++) noiseHit(drums, t0 + sw(e / 2) * beat, e % 2 ? 0.03 : 0.05, 70, 0.45, rnd, 0.3);
        bass(dry, t0, beat * 1.5, root + chord[0], 0.26);
        bass(dry, t0 + sw(2.5) * beat, beat * 1.2, root + chord[0] + (rnd() < 0.5 ? 7 : 0), 0.22);
      }
      for (let s = 0; s < 2; s++) if (rnd() < 0.5) pluck(wet, t0 + (1.5 + s * 2) * beat, notes[Math.floor(rnd() * 4)] + 24, 0.08, 0.4, rnd, 0.993);
    }

    if (style === "snappy") {
      notes.forEach((m, k) => pad(wet, t0, bar, m + 12, 0.05, (k - 1.5) * 0.35, 0.05));
      if (full) {
        for (let q = 0; q < 4; q++) {
          kick(drums, t0 + q * beat, 0.8);
          const i = Math.round((t0 + q * beat) * SR);
          for (let k = 0; k < beat * SR && i + k < n; k++) sc[i + k] = Math.min(sc[i + k], 0.25 + 0.75 * Math.min(1, k / (beat * SR * 0.55)));
          noiseHit(drums, t0 + (q + 0.5) * beat, 0.07, 16, 0.5, rnd, 0.2);
        }
        clap(drums, t0 + beat, 0.32, rnd); clap(drums, t0 + 3 * beat, 0.32, rnd);
        for (let e = 0; e < 16; e += 2) noiseHit(drums, t0 + e * beat / 4, 0.02, 90, 0.5, rnd, -0.3);
        for (let e = 0; e < 8; e++) bass(dry, t0 + (e + 0.5) * beat / 2, beat * 0.4, root + chord[0], 0.2, 1);
      } else {
        for (let e = 0; e < 8; e++) pluck(wet, t0 + e * beat / 2, notes[e % 4] + 24, 0.07, (e % 2) - 0.5, rnd, 0.99);
      }
    }

    if (style === "bouncy") {
      if (full) {
        kick(drums, t0, 0.75); kick(drums, t0 + 2 * beat, 0.7); kick(drums, t0 + 2.75 * beat, 0.45);
        clap(drums, t0 + beat, 0.3, rnd); clap(drums, t0 + 3 * beat, 0.3, rnd);
        for (let e = 0; e < 16; e++) noiseHit(drums, t0 + e * beat / 4, e % 2 ? 0.015 : 0.03, 80, 0.45, rnd, 0.35);
        bass(dry, t0, beat * 0.9, root + chord[0], 0.26); bass(dry, t0 + 1.5 * beat, beat * 0.4, root + chord[0] + 12, 0.18);
        bass(dry, t0 + 2 * beat, beat * 0.9, root + chord[0], 0.26); bass(dry, t0 + 3.5 * beat, beat * 0.4, root + chord[0] + 7, 0.18);
      }
      // A little melody from chord tones on a seeded rhythm.
      for (let e = 0; e < 8; e++) if (rnd() < (full ? 0.7 : 0.4)) pluck(wet, t0 + e * beat / 2, notes[[0, 2, 1, 3, 2, 1, 3, 0][e]] + 24 + (rnd() < 0.2 ? 12 : 0), 0.12, (e % 2 ? 0.3 : -0.3), rnd, 0.993);
      if (b % 2 === 0) notes.forEach((m, k) => pad(wet, t0, bar * 2, m + 12, 0.025, (k - 1.5) * 0.3, 0.3));
    }
  }

  for (const c of o.cuts) if (c > 0.6 && c < o.duration - 0.3) whoosh(dry, c, style === "calm" ? 0.05 : 0.08, rnd, style === "snappy" || style === "bouncy");

  const verb = reverb(wet, n, style === "calm" ? 0.9 : 0.5);
  const l = new Float32Array(n), r = new Float32Array(n);
  let peak = 0;
  // Gentle master low-pass (~9 kHz): takes the fizz off noise and saws.
  const a = 1 - Math.exp((-2 * Math.PI * 9000) / SR);
  let fl = 0, fr = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (o.duration - t) / 1.8));
    const s = sc[i];
    fl += (dry.l[i] * s + wet.l[i] * s * 0.8 + verb.l[i] + drums.l[i] - fl) * a;
    fr += (dry.r[i] * s + wet.r[i] * s * 0.8 + verb.r[i] + drums.r[i] - fr) * a;
    l[i] = Math.tanh(fl * 1.1) * fade;
    r[i] = Math.tanh(fr * 1.1) * fade;
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  // Sit under the picture: about -18 dB RMS, never above -1 dB peak.
  let sum = 0;
  for (let i = 0; i < n; i++) sum += l[i] * l[i] + r[i] * r[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const g = Math.min(0.126 / rms, 0.89 / (peak || 1));
  for (let i = 0; i < n; i++) { l[i] *= g; r[i] *= g; }
  return { l, r };
}

export function writeWav(path: string, { l, r }: { l: Float32Array; r: Float32Array }) {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
}
