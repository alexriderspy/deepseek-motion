import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Beat, Spec } from "./spec.ts";
import { introTime, plan } from "./timing.ts";
import { BODY_STRONG, ENERGIES, FONT_SOURCES, FORMATS, MONO, PALETTES, QUOTE_MARK, TYPE_PAIRS, TYPE_SCALE, type TypeFace } from "./tokens.ts";
import { type Ctx, type SceneOut, r, tw } from "./scenes/kit.ts";
import { readable } from "./color.ts";
import { end, quote, statement, title } from "./scenes/text.ts";
import { bars, compare, list, stat } from "./scenes/data.ts";
import { code } from "./scenes/code.ts";
import { flow, steps } from "./scenes/diagram.ts";
import { custom } from "./scenes/custom.ts";
import { RUNTIME } from "./custom.ts";

const require = createRequire(import.meta.url);

const SCENES: { [K in Beat["scene"]]: (b: Extract<Beat, { scene: K }>, c: Ctx) => SceneOut } = {
  title, statement, stat, list, quote, compare, bars, code, flow, steps, custom, end,
};

export interface Timeline {
  duration: number;
  beats: { scene: string; start: number; duration: number }[];
}

export interface Compiled extends Timeline {
  html: string;
  fonts: TypeFace[];
}

const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 128;
};

export function compile(spec: Spec): Compiled {
  const fmt = FORMATS[spec.format];
  const base = PALETTES[spec.palette];
  const pal = { ...base, accentText: readable(base.accent, base.ink, base.bg), accentOnSurface: readable(base.accent, base.ink, base.surface) };
  const type = TYPE_PAIRS[spec.type];
  const e = ENERGIES[spec.energy];
  const short = Math.min(fmt.width, fmt.height);
  const portrait = fmt.height > fmt.width;
  // Vertical video is watched on a phone at arm's length: small text grows.
  const boost: Partial<Record<keyof typeof TYPE_SCALE, number>> = portrait ? { body: 1.3, caption: 1.3, headline: 1.15 } : {};
  const size = Object.fromEntries(Object.entries(TYPE_SCALE).map(([k, v]) =>
    [k, Math.round(v * short * (boost[k as keyof typeof TYPE_SCALE] ?? 1))])) as Ctx["size"];
  const availW = Math.round(fmt.width * (1 - 2 * fmt.safe.x));
  const travel = Math.round(e.travel * (short / 1080));

  let t = 0;
  const timeline: Timeline["beats"] = [];
  const sections: string[] = [];
  const css: string[] = [];
  const js: string[] = [];
  const durations = plan(spec).durations;
  // Fast energies cut between beats with an accent wipe; slow ones fade.
  const wipe = spec.energy === "snappy" || spec.energy === "bouncy";

  spec.beats.forEach((b, i) => {
    const id = `b${i}`;
    const dur = durations[i];
    const ctx: Ctx = { id, t0: r(t), dur, intro: introTime(b, e), e, pal, type, fmt, size, availW, portrait, travel };
    const out = (SCENES[b.scene] as (b: Beat, c: Ctx) => SceneOut)(b, ctx);
    sections.push(`<section id="${id}" class="clip scene" data-start="${r(t)}" data-duration="${dur}" data-track-index="1">
      <div class="stage">${out.html}</div>
    </section>`);
    css.push(out.css);
    js.push(`// ${id}: ${b.scene}`, ...out.js);
    // The last beat holds its final frame instead of leaving.
    if (i < spec.beats.length - 1) {
      if (wipe) js.push(...wipeAt(t + dur, i));
      else js.push(tw("to", `#${id} .stage`, { opacity: 0, y: -travel / 2, duration: e.exit, ease: "power2.in" }, t + dur - e.exit));
    }
    timeline.push({ scene: b.scene, start: r(t), duration: dur });
    t += dur;
  });
  const total = r(t);

  const fonts = uniqueFonts([type.display, type.body, BODY_STRONG, MONO, QUOTE_MARK]);
  const dark = isDark(pal.bg);
  const bg = background(spec.background, pal, short, total, dark);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${fmt.width}, height=${fmt.height}" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'" />
<title>${spec.title.replace(/</g, "&lt;")}</title>
<script src="assets/gsap.min.js"></script>
<style>
${fonts.map((f) => `@font-face { font-family: "${f.family}"; src: url("assets/fonts/${f.file}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style ?? "normal"}; }`).join("\n")}
body { margin: 0; background: ${pal.bg}; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${pal.bg}; color: ${pal.ink};
  font-family: "${type.display.family}"; font-weight: ${type.display.weight}; font-style: ${type.display.style ?? "normal"};
  text-transform: ${type.upper ? "uppercase" : "none"};
  -webkit-font-smoothing: antialiased; }
.bg { position: absolute; inset: 0; overflow: hidden; }
.fontload { position: absolute; left: 0; top: 0; opacity: 0.001; font-size: 10px; pointer-events: none; }
.vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, ${dark ? "rgba(0,0,0,0.45)" : "rgba(60,40,20,0.10)"}); }
.scene { position: absolute; inset: 0; }
.stage { position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: ${Math.round(fmt.height * fmt.safe.top)}px ${Math.round(fmt.width * fmt.safe.x)}px ${Math.round(fmt.height * fmt.safe.bottom)}px; }
.w { display: inline-block; overflow: hidden; vertical-align: top; padding: 0.06em 0.04em 0.14em; margin: -0.06em -0.04em -0.14em; }
.wi { display: inline-block; }
.hl { position: relative; display: inline-block; }
.hl .w { position: relative; z-index: 1; }
.mark { position: absolute; left: -0.14em; right: -0.14em; top: 0.1em; bottom: 0.02em; border-radius: 0.1em; background: ${pal.accent};
  transform-origin: left center; z-index: 0; }
${bg.css}
.wipe { position: absolute; inset: 0; background: ${pal.accent}; z-index: 5; }
${css.join("\n")}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${fmt.width}" data-height="${fmt.height}" data-duration="${total}" data-fps="30">
  <div class="bg">${bg.html}</div>
  <div class="fontload" aria-hidden="true">${fonts.map((f) => `<span style="font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style ?? "normal"}">Aa</span>`).join("")}</div>
  ${sections.join("\n  ")}
  ${wipe ? `<div class="wipe"></div>` : ""}
  <div class="vignette"></div>
</div>
<script>
${spec.beats.some((b) => b.scene === "custom") ? RUNTIME : ""}
const tl = gsap.timeline({ paused: true });
${wipe ? tw("set", ".wipe", { clipPath: "inset(0% 100% 0% 0%)" }, 0) : ""}
${bg.js.join("\n")}
${js.join("\n")}
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
  return { html, fonts, duration: total, beats: timeline };
}

// The accent panel covers the cut at time T, alternating horizontal and
// vertical sweeps. Every tween is fromTo with immediateRender off, so any
// frame can be seeked to directly.
function wipeAt(T: number, i: number): string[] {
  const [inFrom, inTo, outFrom, outTo] = i % 2 === 0
    ? ["inset(0% 100% 0% 0%)", "inset(0% 0% 0% 0%)", "inset(0% 0% 0% 0%)", "inset(0% 0% 0% 100%)"]
    : ["inset(0% 0% 100% 0%)", "inset(0% 0% 0% 0%)", "inset(0% 0% 0% 0%)", "inset(100% 0% 0% 0%)"];
  return [
    tw("fromTo", ".wipe", { clipPath: inFrom }, { clipPath: inTo, duration: 0.24, ease: "power3.in", immediateRender: false }, T - 0.24),
    tw("fromTo", ".wipe", { clipPath: outFrom }, { clipPath: outTo, duration: 0.3, ease: "power3.out", immediateRender: false }, T + 0.03),
  ];
}

function uniqueFonts(list: TypeFace[]): TypeFace[] {
  const seen = new Map<string, TypeFace>();
  for (const f of list) seen.set(f.file, f);
  return [...seen.values()];
}

function background(kind: Spec["background"], pal: (typeof PALETTES)[string], short: number, total: number, dark: boolean) {
  const out = { html: "", css: "", js: [] as string[] };
  const line = `color-mix(in srgb, ${pal.ink} ${dark ? 7 : 9}%, transparent)`;
  const fade = "mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);";
  if (kind === "glow") {
    const s = Math.round(short * 1.2);
    out.html = `<div class="blob ba" data-layout-allow-overflow></div><div class="blob bb" data-layout-allow-overflow></div>`;
    out.css = `.blob { position: absolute; width: ${s}px; height: ${s}px; border-radius: 50%; background: radial-gradient(closest-side, ${pal.glow}, transparent); }
.ba { left: -${Math.round(s * 0.35)}px; top: -${Math.round(s * 0.4)}px; }
.bb { right: -${Math.round(s * 0.4)}px; bottom: -${Math.round(s * 0.45)}px; }`;
    out.js.push(tw("fromTo", ".ba", { xPercent: 0, yPercent: 0 }, { xPercent: 18, yPercent: 12, duration: total, ease: "sine.inOut" }, 0));
    out.js.push(tw("fromTo", ".bb", { xPercent: 0, yPercent: 0 }, { xPercent: -15, yPercent: -10, duration: total, ease: "sine.inOut" }, 0));
  } else if (kind === "grid" || kind === "dots") {
    const step = Math.round(short * 0.07);
    const img = kind === "grid"
      ? `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`
      : `radial-gradient(circle, color-mix(in srgb, ${pal.ink} ${dark ? 18 : 22}%, transparent) 2.5px, transparent 3px)`;
    out.html = `<div class="pattern"></div>`;
    out.css = `.pattern { position: absolute; inset: 0; background-image: ${img}; background-size: ${step}px ${step}px; ${fade} }`;
    out.js.push(tw("fromTo", ".pattern", { backgroundPosition: "0px 0px" }, { backgroundPosition: `0px ${-step * Math.max(1, Math.round(total / 4))}px`, duration: total, ease: "none" }, 0));
  }
  return out;
}

export function writeProject(spec: Spec, dir: string): Compiled {
  const c = compile(spec);
  mkdirSync(join(dir, "assets", "fonts"), { recursive: true });
  for (const f of c.fonts) {
    const pkgDir = dirname(require.resolve(`${FONT_SOURCES[f.family]}/package.json`));
    copyFileSync(join(pkgDir, "files", f.file), join(dir, "assets", "fonts", f.file));
  }
  copyFileSync(require.resolve("gsap/dist/gsap.min.js"), join(dir, "assets", "gsap.min.js"));
  writeFileSync(join(dir, "index.html"), c.html);
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec, null, 2) + "\n");
  return c;
}
