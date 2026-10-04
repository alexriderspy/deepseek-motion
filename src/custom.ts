import vm from "node:vm";

// Custom scenes: the model writes the body of draw(ctx, t, api), a pure
// function from time to pixels on a full-frame 2D canvas. The api carries
// the video's palette, fonts and motion vocabulary, so free-form code still
// looks like it belongs to the rest of the video.

// Plain JS (no TypeScript) so the same source runs in the browser and in
// the Node smoke test below.
export const RUNTIME = String.raw`
function __dmApi(ctx, W, H, safe, dur, c, fonts) {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    linear: (x) => x,
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
    outBack: (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2),
    outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  };
  // Eased progress of a phase that starts at 'start' and lasts 'len' seconds.
  const p = (t, start, len, e = "outExpo") => ease[e] ? ease[e](clamp((t - start) / len)) : clamp((t - start) / len);
  // Deterministic noise: same i, same number, every render.
  const rand = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const font = (size, kind = "display") => { const f = fonts[kind] || fonts.display; return f.style + " " + f.weight + " " + Math.round(size) + "px \"" + f.family + "\""; };
  // A fixed type scale. Free sizes are snapped to it, so every frame keeps
  // a clear hierarchy and nothing is too small to read on a phone.
  const S = Math.min(W, H), tall = H > W;
  const roles = {
    hero: { size: S * 0.17, font: "display" },
    headline: { size: S * 0.105, font: "display" },
    title: { size: S * 0.068, font: "display" },
    body: { size: S * (tall ? 0.05 : 0.042), font: "body" },
    label: { size: S * (tall ? 0.034 : 0.028), font: "strong", upper: true, tracking: 0.12, color: c.muted },
    number: { size: S * 0.105, font: "mono" },
  };
  // Display sizes stay free; anything smaller than a title snaps to body or label.
  const snap = (size) => size >= roles.title.size * 0.85 ? size : size >= (roles.label.size + roles.body.size) / 2 ? roles.body.size : roles.label.size;
  const style = (o) => {
    const r = roles[o.role] || {};
    const kind = o.font || r.font || "display";
    const size = o.role && !o.size ? r.size : snap(o.size || roles.title.size);
    const upper = o.upper != null ? o.upper : (r.upper || (kind === "display" && fonts.display.upper));
    // Wide tracking is for short labels only, and never more than 0.2em.
    const tracking = Math.max(-0.06, Math.min(0.2, o.tracking != null ? o.tracking : (r.tracking || 0)));
    return { kind, size, upper, tracking, color: o.color || r.color || c.ink };
  };
  const boxes = [];
  const text = (str, x, y, o = {}) => {
    const st = style(o);
    let s = String(str);
    if (st.upper) s = s.toUpperCase();
    ctx.save();
    ctx.font = font(st.size, st.kind);
    ctx.fillStyle = st.color;
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.textAlign = o.align || "center";
    ctx.textBaseline = o.baseline || "middle";
    ctx.letterSpacing = (s.length > 24 ? Math.min(st.tracking, 0.04) : st.tracking) * st.size + "px";
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width, align = ctx.textAlign, base = ctx.textBaseline;
    boxes.push({ s, a: ctx.globalAlpha, x: align === "center" ? x - w / 2 : align === "right" || align === "end" ? x - w : x,
      y: base === "middle" ? y - st.size * 0.5 : base === "top" ? y : base === "bottom" ? y - st.size : y - st.size * 0.8, w, h: st.size });
    ctx.restore();
  };
  const measure = (str, size, kind = "display") => { ctx.save(); ctx.font = font(size, kind); const w = ctx.measureText(String(kind === "display" && fonts.display.upper ? String(str).toUpperCase() : str)).width; ctx.restore(); return w; };
  // Largest size up to maxSize (or a role name) that fits maxW. Never below the label size.
  const fit = (str, maxW, maxSize, kind = "display") => { const m = typeof maxSize === "string" ? roles[maxSize].size : maxSize; const w = measure(str, m, kind); return Math.max(roles.label.size, w > maxW ? m * maxW / w : m); };
  // Words rise into place one after another from behind a mask.
  const kinetic = (str, x, y, o = {}) => {
    const size = o.size || roles[o.role || "headline"].size, kind = o.font || "display", start = o.start || 0, stagger = o.stagger == null ? 0.08 : o.stagger;
    const words = String(str).split(/\s+/), gap = size * 0.28;
    const widths = words.map((w) => measure(w, size, kind));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
    let cx = o.align === "left" ? x : x - total / 2;
    words.forEach((w, i) => {
      const k = p(o.t, start + i * stagger, o.len || 0.7, o.ease || "outExpo");
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - size * 0.1, y - size * 0.75, widths[i] + size * 0.2, size * 1.5); ctx.clip();
      text(w, cx, y + (1 - k) * size * 1.2, { size, font: kind, tracking: 0, color: o.highlight && o.highlight.includes(i) ? c.accent : (o.color || c.ink), align: "left" });
      ctx.restore();
      cx += widths[i] + gap;
    });
    return total;
  };
  const rrect = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); };
  const glow = (color = c.accent, blur = 30) => { ctx.shadowColor = color; ctx.shadowBlur = blur; };
  const noGlow = () => { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; };
  // Zoom and rotate the whole frame around (cx, cy). Call inside save/restore.
  const camera = (zoom = 1, rot = 0, cx = W / 2, cy = H / 2) => { ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy); };
  const alpha = (hex, a) => { const n = parseInt(hex.slice(1, 7), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
  return { W, H, safe, dur, c, roles, ease, p, clamp, lerp, rand, font, text, measure, fit, kinetic, rrect, circle, glow, noGlow, camera, alpha, PI: Math.PI, TAU: Math.PI * 2, __boxes: boxes };
}
`;

export const API_DOC = `You write the BODY of: function draw(ctx, t, api) { ... }
It is called for every frame. t = seconds since this scene started (0 to api.dur). ctx is a CanvasRenderingContext2D covering the whole ${"${W}x${H}"} frame, cleared before each call and transparent (the video background shows through).

Rules:
- Every frame must be a pure function of t. No Date, performance, Math.random, setTimeout, requestAnimationFrame, fetch, document, window. Use api.rand(i) for randomness: it returns the same number for the same i on every frame.
- No state between calls: don't push to arrays that survive the call, don't keep counters outside draw. Recompute everything from t.
- Keep important text and shapes inside api.safe {x, y, w, h}. Backgrounds and decorations may bleed to the edges.
- Use only api.c colors: bg, surface, ink, muted, accent, onAccent, glow. Use api.alpha(color, a) for transparency.
- Text only through api.text / api.kinetic, using a role instead of a size:
    hero (one giant word or number), headline (the main line), title, body, label (1-3 words, small caps), number (stats and counters).
  At most 3 roles in any frame, and one headline or hero at a time. Never space letters out; the roles handle tracking.
- Keep it under 120 lines. Loops of up to ~400 shapes per frame are fine.

api:
  W, H, dur, safe {x, y, w, h}, c {bg, surface, ink, muted, accent, onAccent, glow}, PI, TAU
  p(t, start, len, ease="outExpo") -> 0..1 eased progress of a phase. Eases: linear inCubic outCubic inOutCubic outExpo inExpo inOutExpo outBack outElastic
  ease.<name>(x), clamp(v, a=0, b=1), lerp(a, b, k), rand(i) -> 0..1
  text(str, x, y, {role, color, align, baseline, alpha})  roles: hero headline title body label number
  kinetic(str, x, y, {t, role, size, start, stagger, len, ease, align, color, highlight: [word indexes in accent]}) -> width. Words rise in from a mask one by one.
  fit(str, maxW, "hero" | "headline" | "title") -> the largest size up to that role that fits maxW; pass it to kinetic as size
  measure(str, size, font) -> width
  rrect(x, y, w, h, r) / circle(x, y, r) start a path: then ctx.fill() or ctx.stroke()
  glow(color, blur) / noGlow()
  camera(zoom, rot, cx, cy) -> wrap in ctx.save()/ctx.restore(); use for slow push-ins and punchy zooms
  alpha(hex, a) -> rgba string

What makes it look professional:
- Motion all the time: something should be moving in every frame (slow camera drift, rotating rings, flowing particles), with a few big punchy moments.
- Big type, few words. A headline should fill 60-90% of the safe width (use api.fit). One idea per frame; no paragraphs, no dashboards of tiny labels.
- Layered depth: a soft background layer (large faint shapes or particles), the main subject, then small sharp accents.
- Structure time in phases with api.p: build-up (0-30%), main moment (30-80%), settle/hold (80-100%). Hold the final state readable for the last second.
- One accent color used sparingly for what matters; everything else ink, muted and translucent.`;

const EXAMPLE = String.raw`// Example brief: "requests pour into a rate limiter; only 1 in 3 gets through"
const { W, H, c, p, safe, rand } = api;
const cx = W / 2, cy = H * 0.58;
const R = H * 0.018;
// 1. Camera: slow push the whole time, plus a punch when the gate slams shut.
ctx.save();
api.camera(1 + 0.05 * (t / api.dur) + 0.04 * Math.sin(Math.PI * p(t, 2.2, 0.5, "linear")), 0, cx, cy);
// 2. Background depth: a huge soft glow and a slowly turning dashed ring.
const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.7);
bgGlow.addColorStop(0, api.alpha(c.accent, 0.18 * p(t, 0, 1.2)));
bgGlow.addColorStop(1, api.alpha(c.accent, 0));
ctx.fillStyle = bgGlow;
ctx.fillRect(0, 0, W, H);
ctx.save();
ctx.translate(cx, cy); ctx.rotate(t * 0.25);
ctx.setLineDash([H * 0.02, H * 0.03]);
ctx.strokeStyle = api.alpha(c.ink, 0.12); ctx.lineWidth = 3;
api.circle(0, 0, H * 0.34 * p(t, 0.1, 1.2)); ctx.stroke();
ctx.restore();
// 3. The subject: a tall glowing gate that slams in with overshoot.
const g = p(t, 0.3, 0.7, "outBack");
api.glow(c.accent, 40 * g);
ctx.fillStyle = c.accent;
api.rrect(cx - W * 0.012, cy - H * 0.25 * g, W * 0.024, H * 0.5 * g, W * 0.012); ctx.fill();
api.noGlow();
// 4. The motion: 70 requests with trails. Every third passes and turns accent; the rest bounce off and fade.
for (let i = 0; i < 70; i++) {
  const born = 0.8 + i * 0.07;
  const age = t - born;
  if (age < 0) continue;
  const pass = i % 3 === 0;
  const y = cy + (rand(i) - 0.5) * H * 0.42;
  for (let k = 4; k >= 0; k--) {
    const a = age - k * 0.035;
    if (a < 0) continue;
    const toGate = Math.min(1, a / 0.9);
    let x = api.lerp(safe.x - R, cx - W * 0.02, api.ease.inCubic(toGate));
    let yy = y, alpha = 1;
    if (a > 0.9) {
      const after = a - 0.9;
      if (pass) { x = cx + after * W * 0.45; yy = api.lerp(y, cy, Math.min(1, after * 3)); }
      else { x = cx - W * 0.02 - after * W * 0.25; yy = y + after * after * H * 0.6; alpha = Math.max(0, 1 - after * 1.5); }
    }
    if (alpha <= 0 || x > W + R) continue;
    ctx.fillStyle = api.alpha(pass && a > 0.9 ? c.accent : c.ink, alpha * (1 - k * 0.2) * (pass || a < 0.9 ? 1 : 0.6));
    if (k === 0 && pass && a > 0.9) api.glow(c.accent, 24);
    api.circle(x, yy, R * (1 - k * 0.15)); ctx.fill();
    api.noGlow();
  }
}
ctx.restore();
// 5. Type: a big headline that fills most of the safe width, accent on the key words.
const line = "Only 1 in 3 gets through";
const size = api.fit(line, safe.w * 0.85, "headline");
api.kinetic(line, W / 2, safe.y + size * 0.6, { t, size, start: 0.5, stagger: 0.07, highlight: [1, 2, 3] });
// 6. A live counter, computed from t, not stored: a label over a number.
const passed = Math.min(24, Math.max(0, Math.floor((t - 1.7) / 0.21) + 1));
const show = p(t, 1.7, 0.4);
api.text("passed", safe.x + safe.w, safe.y + safe.h - api.roles.number.size * 1.1, { role: "label", align: "right", alpha: show });
api.text(passed, safe.x + safe.w, safe.y + safe.h - api.roles.number.size * 0.4, { role: "number", color: c.accent, align: "right", alpha: show });`;

export function codePrompt(brief: string, ctxInfo: { W: number; H: number; dur: number; videoTitle: string; neighbours: string }): string {
  return `${API_DOC.replace("${W}x${H}", `${ctxInfo.W}x${ctxInfo.H}`)}

${EXAMPLE}

Now write the scene for this brief, as one hero moment of a video called "${ctxInfo.videoTitle}".
Frame: ${ctxInfo.W}x${ctxInfo.H}. Scene length: ${ctxInfo.dur}s.
Around it in the video: ${ctxInfo.neighbours}
Brief: ${brief}

Reply with only the function body in one \`\`\`js block.`;
}

// Static checks a cheap model trips over most.
const BANNED: [RegExp, string][] = [
  [/\bDate\b|\bperformance\b/, "Don't read the clock; use t."],
  [/Math\.random/, "Don't use Math.random; use api.rand(i) so every render is identical."],
  [/\b(fetch|XMLHttpRequest|WebSocket|import|require)\b/, "No network or imports."],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\b/, "No timers; draw is called for every frame with t."],
  [/\b(document|window|globalThis|localStorage|navigator|eval|Function)\b/, "Only use ctx, t and api."],
];

export function extractCode(reply: string): string {
  const m = reply.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
  let body = (m ? m[1] : reply).trim();
  // Models often wrap the body in the function signature anyway.
  const wrapped = body.match(/^function\s+draw\s*\([^)]*\)\s*\{([\s\S]*)\}\s*;?$/);
  if (wrapped) body = wrapped[1].trim();
  return body;
}

// A canvas that records calls instead of drawing, for the Node smoke test.
function mockCtx(calls: { n: number; sig: string[] }) {
  let font = "16px x";
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    canvas: { width: 0, height: 0 }, globalAlpha: 1, lineWidth: 1, shadowBlur: 0, letterSpacing: "0px",
    textAlign: "start", textBaseline: "alphabetic", fillStyle: "#000", strokeStyle: "#000", globalCompositeOperation: "source-over",
  };
  return new Proxy(target, {
    get(obj, key: string) {
      if (key in obj) return obj[key];
      return (...args: unknown[]) => {
        calls.n++;
        if (args.some((a) => typeof a === "number" && !Number.isFinite(a))) throw new Error(`ctx.${key} got NaN or Infinity (${args.map(String).join(", ")})`);
        if (["fill", "stroke", "fillText", "strokeText", "fillRect", "strokeRect", "drawImage"].includes(key)) calls.sig.push(`${key}`);
        if (["arc", "rect", "roundRect", "moveTo", "lineTo", "fillText", "fillRect", "translate", "scale", "rotate", "ellipse", "bezierCurveTo", "quadraticCurveTo"].includes(key))
          calls.sig.push(`${key}:${args.filter((a) => typeof a === "number").map((a) => (a as number).toFixed(1)).join(",")}`);
        if (key === "measureText") {
          const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "16");
          return { width: String(args[0]).length * size * 0.55, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
        }
        if (key.startsWith("create")) return gradient;
        if (key === "getImageData") return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
        if (key === "getTransform") return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        return undefined;
      };
    },
    set(obj, key: string, value) {
      if (key === "font") font = String(value);
      obj[key] = value;
      return true;
    },
  });
}

interface Box { s: string; a: number; x: number; y: number; w: number; h: number }

// Readable text only: overlapping lines and text running off the frame.
// Positions ignore camera transforms, so the thresholds are forgiving.
function textProblems(boxes: Box[], env: { W: number; H: number }, t: number): string[] {
  const out: string[] = [];
  const solid = boxes.filter((b) => b.a >= 0.5 && b.s.trim());
  for (const b of solid) {
    const over = Math.max(0, -b.x, b.x + b.w - env.W) / b.w;
    if (over > 0.15) { out.push(`At t=${t} the text "${b.s}" runs off the frame. Keep text inside api.safe and size it with api.fit.`); break; }
  }
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    if (a.s === b.s) continue;
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (ix * iy > 0.2 * Math.min(a.w * a.h, b.w * b.h)) {
      out.push(`At t=${t} the text "${a.s}" overlaps "${b.s}". Give every line its own space, at least one line height apart.`);
      return out;
    }
  }
  return out;
}

export interface CodeCheck {
  ok: boolean;
  problems: string[];
}

// Syntax, banned APIs, then a run at several moments in a sandbox with a
// time limit: catches crashes, NaN coordinates, infinite loops, blank and
// motionless scenes before a browser ever sees the code.
export function checkCode(code: string, env: { W: number; H: number; dur: number }): CodeCheck {
  const problems: string[] = [];
  for (const [re, msg] of BANNED) if (re.test(code)) problems.push(msg);
  if (problems.length) return { ok: false, problems };
  try {
    new vm.Script(`(function draw(ctx, t, api) {\n${code}\n})`);
  } catch (e) {
    return { ok: false, problems: [`Syntax error: ${(e as Error).message}`] };
  }
  const fonts = { display: { family: "X", weight: 700, style: "normal" }, body: { family: "X", weight: 500, style: "normal" }, strong: { family: "X", weight: 700, style: "normal" }, mono: { family: "X", weight: 500, style: "normal" } };
  const colors = { bg: "#000000", surface: "#111111", ink: "#ffffff", muted: "#888888", accent: "#ff0000", onAccent: "#000000", glow: "#ff000033" };
  const safe = { x: env.W * 0.07, y: env.H * 0.09, w: env.W * 0.86, h: env.H * 0.82 };
  const sandbox = vm.createContext({ Math, Number, String, Array, Object, JSON, isFinite, parseFloat, parseInt });
  const frames: string[] = [];
  for (const k of [0.05, 0.3, 0.55, 0.8, 0.99]) {
    const t = +(env.dur * k).toFixed(3);
    const calls = { n: 0, sig: [] as string[] };
    sandbox.__ctx = mockCtx(calls);
    try {
      vm.runInContext(`${RUNTIME}\nvar __api = __dmApi(__ctx, ${env.W}, ${env.H}, ${JSON.stringify(safe)}, ${env.dur}, ${JSON.stringify(colors)}, ${JSON.stringify(fonts)});\n(function(ctx, t, api) {\n${code}\n})(__ctx, ${t}, __api);`, sandbox, { timeout: 250 });
    } catch (e) {
      const msg = (e as Error).message;
      problems.push(/timed out/i.test(msg) ? `At t=${t} the frame took too long to draw (an endless or huge loop). Keep loops small.` : `At t=${t} it crashed: ${msg}`);
      break;
    }
    if (calls.sig.filter((s) => /^(fill|stroke|fillText|strokeText|fillRect|strokeRect|drawImage)/.test(s)).length === 0 && k >= 0.3)
      problems.push(`At t=${t} nothing is drawn. Make sure shapes and text are visible through most of the scene.`);
    frames.push(calls.sig.join("|"));
    problems.push(...textProblems((sandbox.__api as { __boxes: Box[] }).__boxes, env, t));
  }
  if (!problems.length && new Set(frames.slice(1, 4)).size === 1) problems.push("Nothing moves: the frames at 30%, 55% and 80% are identical. Keep something in motion the whole time.");
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
