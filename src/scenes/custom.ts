import type { Beat } from "../spec.ts";
import { type Ctx, type SceneOut, r } from "./kit.ts";

// Hosts model-written draw code on a full-frame canvas and drives it from
// the timeline, so seeking to any time repaints exactly that frame.
export function custom(b: Extract<Beat, { scene: "custom" }>, c: Ctx): SceneOut {
  if (!b.code) throw new Error(`${c.id}: custom beat has no code`);
  const { width: W, height: H, safe: s } = c.fmt;
  const safe = { x: r(W * s.x), y: r(H * s.top), w: r(W * (1 - 2 * s.x)), h: r(H * (1 - s.top - s.bottom)) };
  const face = (f: Ctx["type"]["display"]) => ({ family: f.family, weight: f.weight, style: f.style ?? "normal" });
  const fonts = { display: face(c.type.display), body: face(c.type.body), mono: { family: "JetBrains Mono", weight: 500, style: "normal" } };
  const colors = { bg: c.pal.bg, surface: c.pal.surface, ink: c.pal.ink, muted: c.pal.muted, accent: c.pal.accent, onAccent: c.pal.onAccent, glow: c.pal.glow };
  const js = [`(function () {
  const cv = document.querySelector("#${c.id} .cv"), ctx = cv.getContext("2d");
  const api = __dmApi(ctx, ${W}, ${H}, ${JSON.stringify(safe)}, ${b.seconds}, ${JSON.stringify(colors)}, ${JSON.stringify(fonts)});
  function draw(ctx, t, api) {
${b.code}
  }
  const paint = (t) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ${W}, ${H}); ctx.save(); try { draw(ctx, t, api); } catch (e) {} ctx.restore(); };
  const st = { t: 0 };
  paint(0);
  tl.fromTo(st, { t: 0 }, { t: ${b.seconds}, duration: ${b.seconds}, ease: "none", onUpdate: () => paint(st.t) }, ${c.t0});
})();`];
  return {
    html: `<canvas class="cv" width="${W}" height="${H}"></canvas>`,
    css: `#${c.id} .cv { position: absolute; inset: 0; width: 100%; height: 100%; }`,
    js,
  };
}
