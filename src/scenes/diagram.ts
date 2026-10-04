import type { Beat } from "../spec.ts";
import { flowGap, stepGap } from "../timing.ts";
import { type Ctx, type SceneOut, esc, fitSize, fontFace, maskedWords, r, tw } from "./kit.ts";

type B<S extends Beat["scene"]> = Extract<Beat, { scene: S }>;

const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
// Later tweens on an element must not render early, or seeking breaks.
const late = { immediateRender: false };

function heading(c: Ctx, text: string | undefined, cls: string) {
  if (!text) return { html: "", css: "", js: [] as string[] };
  const fs = fitSize(text, c.size.headline, c.availW, c.type.display.family, 2);
  return {
    html: `<h3 class="${cls}">${maskedWords(text)}</h3>`,
    css: `#${c.id} .${cls} { margin: 0 0 1.1em; font-size: ${fs}px; line-height: 1.08; letter-spacing: ${c.type.displayTracking};
      text-wrap: balance; text-align: center; max-width: ${c.availW}px; }`,
    js: [tw("fromTo", `#${c.id} .${cls} .wi`, { yPercent: 115 }, { yPercent: 0, duration: c.e.enter, ease: c.e.ease, stagger: c.e.stagger }, c.t0)],
  };
}

// Stages joined by arrows. After the build, a packet keeps travelling from
// stage to stage for the rest of the hold, so the idea of flow is literal.
export function flow(b: B<"flow">, c: Ctx): SceneOut {
  const h = heading(c, b.title, "ft");
  const n = b.nodes.length;
  const vertical = c.portrait;
  // Few nodes get short boxes and long arrows; many nodes share the width.
  const minArrow = c.size.body * (vertical ? 1.2 : 1.9);
  const nodeW = vertical ? Math.round(c.availW * 0.72) : Math.floor(Math.min(c.size.body * 8, (c.availW - minArrow * (n - 1)) / n));
  const arrowL = Math.round(vertical ? minArrow : Math.min(c.size.body * 4.5, (c.availW * 0.92 - n * nodeW) / (n - 1)));
  const longest = b.nodes.reduce((a, x) => (x.length > a.length ? x : a), "");
  const fs = fitSize(longest, Math.round(c.size.body * (vertical ? 1.15 : 1.25)), nodeW * 0.8, c.type.body.family, 2);
  const pkt = Math.round(fs * 0.42);
  const parts: string[] = [];
  b.nodes.forEach((label, i) => {
    parts.push(`<div class="node n${i}${i === n - 1 ? " dest" : ""}"><span>${esc(label)}</span></div>`);
    if (i < n - 1) parts.push(`<div class="arrow a${i}"><div class="line"></div><div class="head"></div><div class="pkt"></div></div>`);
  });
  const html = `${h.html}<div class="flow">${parts.join("")}</div>${b.caption ? `<div class="cap">${esc(b.caption)}</div>` : ""}`;
  const head = Math.round(fs * 0.3);
  const css = `${h.css}
    #${c.id} .flow { display: flex; flex-direction: ${vertical ? "column" : "row"}; align-items: center; }
    #${c.id} .node { box-sizing: border-box; width: ${nodeW}px; min-height: ${Math.round(fs * (vertical ? 2.4 : 3))}px; display: grid; place-items: center;
      padding: ${Math.round(fs * 0.5)}px ${Math.round(fs * 0.6)}px; border-radius: ${Math.round(fs * 0.45)}px; background: ${c.pal.surface};
      border: 3px solid ${mix(c.pal.ink, 14)}; ${fontFace(c.type.body)} font-size: ${fs}px; line-height: 1.2; text-align: center; color: ${c.pal.ink}; }
    #${c.id} .node.dest { border-color: ${c.pal.accent}; background: color-mix(in srgb, ${c.pal.accent} 14%, ${c.pal.surface}); }
    #${c.id} .arrow { position: relative; flex: none; width: ${vertical ? head * 3 : arrowL}px; height: ${vertical ? arrowL : head * 3}px; }
    #${c.id} .line { position: absolute; background: ${mix(c.pal.ink, 35)};
      ${vertical ? `left: 50%; width: 4px; margin-left: -2px; top: 0; bottom: ${head}px; transform-origin: center top;`
        : `top: 50%; height: 4px; margin-top: -2px; left: 0; right: ${head}px; transform-origin: left center;`} }
    #${c.id} .head { position: absolute; width: 0; height: 0;
      ${vertical ? `left: 50%; bottom: 0; margin-left: -${head}px; border-left: ${head}px solid transparent; border-right: ${head}px solid transparent; border-top: ${Math.round(head * 1.4)}px solid ${mix(c.pal.ink, 35)};`
        : `top: 50%; right: 0; margin-top: -${head}px; border-top: ${head}px solid transparent; border-bottom: ${head}px solid transparent; border-left: ${Math.round(head * 1.4)}px solid ${mix(c.pal.ink, 35)};`} }
    #${c.id} .pkt { position: absolute; width: ${pkt}px; height: ${pkt}px; border-radius: 50%; background: ${c.pal.accent}; opacity: 0;
      box-shadow: 0 0 ${pkt * 1.5}px ${c.pal.accent}; ${vertical ? `left: 50%; margin-left: -${pkt / 2}px; top: 0; margin-top: -${pkt / 2}px;` : `top: 50%; margin-top: -${pkt / 2}px; left: 0; margin-left: -${pkt / 2}px;`} }
    #${c.id} .cap { margin-top: 1.4em; ${fontFace(c.type.body)} font-size: ${Math.round(c.size.body * 0.95)}px; color: ${c.pal.muted};
      max-width: ${Math.round(c.availW * 0.8)}px; text-align: center; text-wrap: balance; }`;

  const gap = flowGap(c.e);
  const t0 = c.t0 + (b.title ? 0.25 : 0);
  const js = [...h.js];
  b.nodes.forEach((_, i) => {
    const at = t0 + i * gap;
    js.push(tw("fromTo", `#${c.id} .n${i}`, { opacity: 0, scale: 0.85, y: c.travel / 3 }, { opacity: 1, scale: 1, y: 0, duration: Math.min(0.6, c.e.enter), ease: c.e.ease }, at));
    if (i < n - 1) {
      const axis = vertical ? "scaleY" : "scaleX";
      js.push(tw("fromTo", `#${c.id} .a${i} .line`, { [axis]: 0 }, { [axis]: 1, duration: gap * 0.8, ease: "power2.inOut" }, at + gap * 0.4));
      js.push(tw("fromTo", `#${c.id} .a${i} .head`, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none" }, at + gap * 1.1));
    }
  });
  if (b.caption) js.push(tw("fromTo", `#${c.id} .cap`, { opacity: 0, y: c.travel / 3 }, { opacity: 1, y: 0, duration: c.e.enter, ease: c.e.ease }, t0 + n * gap));

  // Packet loops, written out tween by tween so every frame is seekable.
  const hop = 0.5;
  const cycle = (n - 1) * hop + 0.35;
  const start = c.t0 + c.intro;
  const end = c.t0 + c.dur - c.e.exit - 0.1;
  const prop = vertical ? "y" : "x";
  const dist = arrowL - head;
  for (let k = 0, s = start; k < 6 && s + cycle <= end + 0.01; k++, s += cycle) {
    for (let j = 0; j < n - 1; j++) {
      const at = s + j * hop;
      js.push(tw("fromTo", `#${c.id} .a${j} .pkt`, { [prop]: 0, opacity: 1 }, { [prop]: dist, duration: hop, ease: "power1.inOut", ...late }, at));
      js.push(tw("fromTo", `#${c.id} .a${j} .pkt`, { opacity: 1 }, { opacity: 0, duration: 0.06, ease: "none", ...late }, at + hop));
      js.push(tw("fromTo", `#${c.id} .n${j + 1}`, { scale: 1.06 }, { scale: 1, duration: 0.35, ease: "power2.out", ...late }, at + hop));
    }
  }
  return { html, css, js };
}

// A progress tracker: steps tick off in order while the bar fills to them.
export function steps(b: B<"steps">, c: Ctx): SceneOut {
  const h = heading(c, b.title, "stt");
  const n = b.steps.length;
  // Five or more labels side by side get too small to read: stack them.
  const vertical = c.portrait || n >= 5;
  const dot = Math.round(c.size.body * (vertical ? 1.4 : 1.5));
  const W = c.portrait ? Math.round(c.availW * 0.9) : vertical ? Math.round(c.availW * 0.6) : c.availW;
  const longest = b.steps.reduce((a, x) => (x.length > a.length ? x : a), "");
  const fs = vertical
    ? fitSize(longest, Math.round(c.size.body * 1.15), W - dot * 1.6, c.type.body.family, 1)
    : fitSize(longest, Math.round(c.size.body * 1.3), (W / n) * 0.88, c.type.body.family, 2);
  const html = `${h.html}
    <div class="stepper">
      <div class="track"><div class="fill"></div></div>
      ${b.steps.map((s, i) => `<div class="step s${i}"><div class="dot"><span class="num">${i + 1}</span><span class="chk">&#10003;</span></div><div class="lbl">${esc(s)}</div></div>`).join("")}
    </div>`;
  const rowGap = Math.round(dot * 0.55);
  const css = `${h.css}
    #${c.id} .stepper { position: relative; display: flex; flex-direction: ${vertical ? "column" : "row"}; width: ${W}px; ${vertical ? `gap: ${rowGap}px;` : ""} }
    #${c.id} .track { position: absolute; background: ${mix(c.pal.ink, 14)};
      ${vertical ? `left: ${dot / 2 - 3}px; width: 6px; top: ${dot / 2}px; bottom: ${dot / 2}px;`
        : `top: ${dot / 2 - 3}px; height: 6px; left: ${(100 / n / 2).toFixed(3)}%; right: ${(100 / n / 2).toFixed(3)}%;`} border-radius: 3px; }
    #${c.id} .fill { position: absolute; inset: 0; background: ${c.pal.accent}; border-radius: inherit; transform-origin: ${vertical ? "center top" : "left center"}; }
    #${c.id} .step { position: relative; display: flex; flex-direction: ${vertical ? "row" : "column"}; align-items: center; ${vertical ? `gap: ${Math.round(dot * 0.55)}px; min-height: ${dot}px;` : "flex: 1;"} }
    #${c.id} .dot { position: relative; flex: none; width: ${dot}px; height: ${dot}px; box-sizing: border-box; border-radius: 50%;
      border: 4px solid ${mix(c.pal.ink, 28)}; background: ${c.pal.bg}; display: grid; place-items: center; z-index: 1; }
    #${c.id} .num { ${fontFace(c.type.body)} font-size: ${Math.round(dot * 0.42)}px; color: ${c.pal.muted}; }
    #${c.id} .chk { position: absolute; inset: 0; display: grid; place-items: center; font-family: "Inter"; font-weight: 800;
      font-size: ${Math.round(dot * 0.5)}px; color: ${c.pal.onAccent}; opacity: 0; }
    #${c.id} .lbl { ${fontFace(c.type.body)} font-size: ${fs}px; line-height: 1.2; color: ${c.pal.ink};
      ${vertical ? "" : `margin-top: 0.8em; max-width: ${Math.round((W / n) * 0.9)}px; text-align: center; text-wrap: balance;`} }`;

  const gap = stepGap(c.e);
  const t0 = c.t0 + (b.title ? 0.25 : 0);
  const axis = vertical ? "scaleY" : "scaleX";
  const js = [...h.js,
    tw("fromTo", `#${c.id} .step`, { opacity: 0, [vertical ? "x" : "y"]: c.travel / 3 }, { opacity: 1, [vertical ? "x" : "y"]: 0, duration: 0.45, ease: "power2.out", stagger: 0.05 }, t0),
    tw("fromTo", `#${c.id} .lbl`, { opacity: 0.35 }, { opacity: 0.35, duration: 0.01 }, t0),
    tw("fromTo", `#${c.id} .fill`, { [axis]: 0 }, { [axis]: 0, duration: 0.01 }, t0),
  ];
  b.steps.forEach((_, i) => {
    const at = t0 + 0.3 + i * gap;
    if (i > 0) js.push(tw("fromTo", `#${c.id} .fill`, { [axis]: r((i - 1) / (n - 1)) }, { [axis]: r(i / (n - 1)), duration: gap * 0.7, ease: "power2.inOut", ...late }, at - gap * 0.7));
    js.push(tw("fromTo", `#${c.id} .s${i} .dot`, { backgroundColor: c.pal.bg, borderColor: mix(c.pal.ink, 28), scale: 0.8 },
      { backgroundColor: c.pal.accent, borderColor: c.pal.accent, scale: 1, duration: 0.45, ease: "back.out(2.2)", immediateRender: false }, at));
    js.push(tw("fromTo", `#${c.id} .s${i} .num`, { opacity: 1 }, { opacity: 0, duration: 0.15, ease: "none", immediateRender: false }, at));
    js.push(tw("fromTo", `#${c.id} .s${i} .chk`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.5)", immediateRender: false }, at + 0.08));
    js.push(tw("fromTo", `#${c.id} .s${i} .lbl`, { opacity: 0.35 }, { opacity: 1, duration: 0.3, ease: "power2.out", immediateRender: false }, at));
  });
  return { html, css, js };
}
