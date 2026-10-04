import type { Beat } from "../spec.ts";
import { countDuration } from "../timing.ts";
import { type Ctx, type SceneOut, esc, fitSize, fontFace, maskedWords, tw } from "./kit.ts";

type B<S extends Beat["scene"]> = Extract<Beat, { scene: S }>;

const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function heading(c: Ctx, text: string | undefined, cls: string): { html: string; css: string; js: string[] } {
  if (!text) return { html: "", css: "", js: [] };
  const fs = fitSize(text, c.size.headline, c.availW, c.type.display.family, 2);
  return {
    html: `<h3 class="${cls}">${maskedWords(text)}</h3>`,
    css: `#${c.id} .${cls} { margin: 0 0 0.9em; font-size: ${fs}px; line-height: 1.08; letter-spacing: ${c.type.displayTracking};
      text-wrap: balance; text-align: center; max-width: ${c.availW}px; }`,
    js: [tw("fromTo", `#${c.id} .${cls} .wi`, { yPercent: 115 }, { yPercent: 0, duration: c.e.enter, ease: c.e.ease, stagger: c.e.stagger }, c.t0)],
  };
}

export function stat(b: B<"stat">, c: Ctx): SceneOut {
  const decimals = b.decimals ?? (Number.isInteger(b.value) ? 0 : 1);
  const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const final = fmt(b.value);
  const full = `${b.prefix ?? ""}${final}${b.suffix ?? ""}`;
  const fs = fitSize(full.replace(/\s/g, ""), c.size.hero * 1.9, c.availW, c.type.display.family, 1);
  const labelW = Math.round(c.availW * (c.portrait ? 1 : 0.62));
  const html = `
    <div class="row">
      ${b.prefix ? `<span class="aff pre">${esc(b.prefix)}</span>` : ""}
      <span class="num">${final}</span>
      ${b.suffix ? `<span class="aff suf">${esc(b.suffix)}</span>` : ""}
    </div>
    <div class="rule"></div>
    <div class="label">${esc(b.label)}</div>`;
  const css = `
    #${c.id} .row { display: flex; align-items: flex-start; justify-content: center; line-height: 1; }
    #${c.id} .num { display: inline-block; font-size: ${fs}px; font-variant-numeric: tabular-nums; letter-spacing: -0.04em;
      text-align: center; transform-origin: center 70%; }
    #${c.id} .aff { display: inline-block; font-size: ${Math.round(fs * 0.45)}px; color: ${c.pal.accent}; margin-top: 0.12em; }
    #${c.id} .pre { margin-right: 0.08em; }
    #${c.id} .suf { margin-left: 0.06em; }
    #${c.id} .rule { width: ${Math.round(c.size.body * 3)}px; height: ${Math.max(4, Math.round(c.size.body * 0.14))}px;
      background: ${c.pal.accent}; margin: 0.5em 0 0.9em; transform-origin: center; }
    #${c.id} .label { ${fontFace(c.type.body)} font-size: ${Math.round(c.size.body * 1.15)}px; line-height: 1.3; color: ${c.pal.ink};
      opacity: 0.85; max-width: ${labelW}px; text-align: center; text-wrap: balance; }`;
  const cd = countDuration(c.e);
  const v = `s_${c.id}`;
  const js = [
    `const ${v} = { v: 0 }; const el_${c.id} = document.querySelector("#${c.id} .num");`,
    `tl.fromTo(${v}, { v: 0 }, { v: ${b.value}, duration: ${cd}, ease: "power3.out", onUpdate: () => { el_${c.id}.textContent = ${v}.v.toLocaleString("en-US", { minimumFractionDigits: ${decimals}, maximumFractionDigits: ${decimals} }); } }, ${c.t0});`,
    tw("fromTo", `#${c.id} .num`, { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: cd, ease: "power3.out" }, c.t0),
    tw("fromTo", `#${c.id} .rule`, { scaleX: 0 }, { scaleX: 1, duration: c.e.enter, ease: c.e.ease }, c.t0 + 0.2),
    tw("fromTo", `#${c.id} .label`, { opacity: 0, y: c.travel / 2 }, { opacity: 0.85, y: 0, duration: c.e.enter, ease: c.e.ease }, c.t0 + 0.3),
  ];
  if (b.prefix) js.push(tw("fromTo", `#${c.id} .pre`, { opacity: 0, x: -c.travel / 2 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, c.t0 + 0.1));
  if (b.suffix) js.push(tw("fromTo", `#${c.id} .suf`, { opacity: 0, y: c.travel / 2 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)" }, c.t0 + cd - 0.2));
  return { html, css, js };
}

export function list(b: B<"list">, c: Ctx): SceneOut {
  const h = heading(c, b.title, "lt");
  const w = c.portrait ? c.availW : Math.round(c.availW * 0.72);
  const longest = b.items.reduce((a, x) => (x.length > a.length ? x : a), "");
  // Long items may wrap to a second line rather than shrink.
  const itemFs = fitSize(longest, Math.round(c.size.body * 1.6), w * 0.85, c.type.body.family, 2);
  const html = `${h.html}
    <ol class="items">${b.items.map((it, i) => `
      <li><span class="ix">${String(i + 1).padStart(2, "0")}</span><span class="it">${esc(it)}</span></li>`).join("")}
    </ol>`;
  const css = `${h.css}
    #${c.id} .items { list-style: none; margin: 0; padding: 0; width: ${w}px; }
    #${c.id} li { display: flex; align-items: baseline; gap: 0.9em; padding: 0.5em 0; border-top: 2px solid ${mix(c.pal.ink, 14)}; }
    #${c.id} li:last-child { border-bottom: 2px solid ${mix(c.pal.ink, 14)}; }
    #${c.id} .ix { font-size: ${Math.round(itemFs * 0.62)}px; color: ${c.pal.accentText}; font-variant-numeric: tabular-nums; }
    #${c.id} .it { ${fontFace(c.type.body)} font-size: ${itemFs}px; line-height: 1.25; color: ${c.pal.ink}; }`;
  const js = [...h.js];
  b.items.forEach((_, i) => {
    js.push(tw("fromTo", `#${c.id} li:nth-child(${i + 1})`, { opacity: 0, x: -c.travel },
      { opacity: 1, x: 0, duration: c.e.enter, ease: c.e.ease }, c.t0 + 0.25 + i * c.e.stagger * 3));
  });
  return { html, css, js };
}

export function compare(b: B<"compare">, c: Ctx): SceneOut {
  const h = heading(c, b.title, "ct");
  const cardW = c.portrait ? c.availW : Math.round((c.availW - c.size.body * 2) / 2);
  const valFs = (v?: string) => (v ? fitSize(v, c.size.display, cardW * 0.8, c.type.display.family, 1) : 0);
  const card = (side: "left" | "right") => {
    const s = b[side];
    const win = b.winner === side ? " win" : "";
    return `<div class="card ${side}${win}"><div class="cl">${esc(s.label)}</div>${s.value ? `<div class="cv" style="font-size:${valFs(s.value)}px">${esc(s.value)}</div>` : ""}</div>`;
  };
  const html = `${h.html}<div class="cmp">${card("left")}<div class="vs">vs</div>${card("right")}</div>`;
  const css = `${h.css}
    #${c.id} .cmp { display: flex; flex-direction: ${c.portrait ? "column" : "row"}; align-items: stretch; width: ${c.availW}px; }
    #${c.id} .card { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 0.35em;
      padding: ${Math.round(c.size.body * (c.portrait ? 1.2 : 1.8))}px ${Math.round(c.size.body)}px; border-radius: ${Math.round(c.size.body * 0.6)}px;
      background: ${c.pal.surface}; border: 3px solid ${mix(c.pal.ink, 8)}; }
    #${c.id} .card.win { border-color: ${c.pal.accent}; }
    #${c.id} .cl { ${fontFace(c.type.body)} font-size: ${Math.round(c.size.body * 1.1)}px; color: ${c.pal.muted}; text-align: center; }
    #${c.id} .cv { line-height: 1; letter-spacing: ${c.type.displayTracking}; text-align: center; }
    #${c.id} .win .cv { color: ${c.pal.accent}; }
    #${c.id} .vs { flex: none; align-self: center; z-index: 2; display: grid; place-items: center;
      width: ${Math.round(c.size.body * 2.2)}px; height: ${Math.round(c.size.body * 2.2)}px; margin: ${Math.round(-c.size.body * 0.4)}px;
      border-radius: 50%; background: ${c.pal.accent}; color: ${c.pal.onAccent}; ${fontFace(c.type.body)} font-size: ${Math.round(c.size.body * 0.85)}px; }`;
  const axis = c.portrait ? "y" : "x";
  const t = c.t0 + (b.title ? 0.25 : 0);
  const js = [...h.js,
    tw("fromTo", `#${c.id} .card.left`, { opacity: 0, [axis]: -c.travel * 1.5 }, { opacity: 1, [axis]: 0, duration: c.e.enter, ease: c.e.ease }, t),
    tw("fromTo", `#${c.id} .card.right`, { opacity: 0, [axis]: c.travel * 1.5 }, { opacity: 1, [axis]: 0, duration: c.e.enter, ease: c.e.ease }, t + 0.1),
    tw("fromTo", `#${c.id} .vs`, { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(2)" }, t + c.e.enter * 0.6),
  ];
  if (b.winner) {
    const lose = b.winner === "left" ? "right" : "left";
    js.push(tw("to", `#${c.id} .card.${lose}`, { opacity: 0.45, duration: 0.5, ease: "power2.out" }, t + c.e.enter + 0.3));
    js.push(tw("to", `#${c.id} .card.${b.winner}`, { scale: 1.04, duration: 0.5, ease: "power2.out" }, t + c.e.enter + 0.3));
  }
  return { html, css, js };
}

export function bars(b: B<"bars">, c: Ctx): SceneOut {
  const h = heading(c, b.title, "bt");
  const w = c.portrait ? c.availW : Math.round(c.availW * 0.78);
  const max = Math.max(...b.bars.map((x) => x.value));
  const fs = Math.round(c.size.body * (c.portrait ? 1 : 1.1));
  const fmt = (v: number) => `${Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(1)}${b.unit ?? ""}`;
  const html = `${h.html}<div class="bars">${b.bars.map((x, i) => `
    <div class="bl r${i + 1}${x.value === max ? " top" : ""}">${esc(x.label)}</div>
    <div class="track"><div class="fill${x.value === max ? " top" : ""}" style="width:${((x.value / max) * 100).toFixed(2)}%"></div></div>
    <div class="bv r${i + 1}${x.value === max ? " top" : ""}">${fmt(x.value)}</div>`).join("")}
  </div>`;
  const css = `${h.css}
    #${c.id} .bars { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: ${Math.round(fs * 0.55)}px ${Math.round(fs * 0.6)}px;
      width: ${w}px; ${fontFace(c.type.body)} font-size: ${fs}px; }
    #${c.id} .bl { color: ${c.pal.muted}; white-space: nowrap; }
    #${c.id} .track { height: ${Math.round(fs * 0.85)}px; border-radius: ${Math.round(fs * 0.2)}px; background: ${mix(c.pal.ink, 7)}; }
    #${c.id} .fill { height: 100%; border-radius: inherit; background: ${mix(c.pal.ink, 38)}; transform-origin: left center; }
    #${c.id} .fill.top { background: ${c.pal.accent}; }
    #${c.id} .bv { font-variant-numeric: tabular-nums; color: ${c.pal.ink}; min-width: 3ch; text-align: right; }
    #${c.id} .bv.top, #${c.id} .bl.top { color: ${c.pal.accentText}; }`;
  const js = [...h.js];
  b.bars.forEach((_, i) => {
    const at = c.t0 + 0.2 + i * c.e.stagger * 2;
    const n = i + 1;
    js.push(tw("fromTo", `#${c.id} .r${n}`, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, at));
  });
  // Grid children share one parent, so index rows by order within each class.
  const fills = `Array.from(document.querySelectorAll("#${c.id} .fill"))`;
  js.push(`tl.fromTo(${fills}, { scaleX: 0 }, { scaleX: 1, duration: 1.0, ease: ${JSON.stringify(c.e.ease === "sine.out" ? "power2.out" : c.e.ease)}, stagger: ${c.e.stagger * 2} }, ${c.t0 + 0.25});`);
  return { html, css, js };
}
