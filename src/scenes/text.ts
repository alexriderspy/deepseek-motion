import type { Beat } from "../spec.ts";
import { type Ctx, type SceneOut, esc, fitSize, fontFace, maskedWords, r, tw } from "./kit.ts";

type B<S extends Beat["scene"]> = Extract<Beat, { scene: S }>;

const rise = (c: Ctx, sel: string, at: number, stagger = c.e.stagger) =>
  tw("fromTo", sel, { yPercent: 115 }, { yPercent: 0, duration: c.e.enter, ease: c.e.ease, stagger }, at);

const fadeUp = (c: Ctx, sel: string, at: number, dist = c.travel / 2) =>
  tw("fromTo", sel, { opacity: 0, y: dist }, { opacity: 1, y: 0, duration: c.e.enter, ease: c.e.ease }, at);

export function title(b: B<"title">, c: Ctx): SceneOut {
  const fs = fitSize(b.text, c.size.hero, c.availW, c.type.display.family, c.portrait ? 4 : 2);
  const html = `
    ${b.kicker ? `<div class="kicker"><span class="bar"></span><span class="kt">${esc(b.kicker)}</span></div>` : ""}
    <h1 class="disp">${maskedWords(b.text)}</h1>`;
  const css = `
    #${c.id} .kicker { display: flex; align-items: center; gap: 0.7em; margin-bottom: 1.1em; ${fontFace(c.type.body)}
      font-size: ${c.size.caption}px; letter-spacing: 0.2em; text-transform: uppercase; color: ${c.pal.accentText}; }
    #${c.id} .bar { display: block; width: 2.4em; height: 0.16em; background: ${c.pal.accent}; transform-origin: left center; }
    #${c.id} h1 { margin: 0; font-size: ${fs}px; line-height: 1.02; letter-spacing: ${c.type.displayTracking};
      max-width: ${c.availW}px; text-wrap: balance; text-align: center; }`;
  const t = c.t0;
  const js = [
    rise(c, `#${c.id} h1 .wi`, t + 0.15),
    tw("fromTo", `#${c.id} h1`, { scale: 1 }, { scale: 1.035, duration: c.dur, ease: "none" }, t),
  ];
  if (b.kicker) {
    js.push(tw("fromTo", `#${c.id} .bar`, { scaleX: 0 }, { scaleX: 1, duration: c.e.enter, ease: c.e.ease }, t));
    js.push(fadeUp(c, `#${c.id} .kt`, t + 0.05));
  }
  return { html, css, js };
}

export function statement(b: B<"statement">, c: Ctx): SceneOut {
  const maxW = c.portrait ? c.availW : Math.round(c.availW * 0.82);
  const fs = fitSize(b.text, c.size.display, maxW, c.type.display.family, c.portrait ? 6 : 3);
  const html = `<p class="stmt">${maskedWords(b.text, { highlight: b.highlight })}</p>`;
  const css = `
    #${c.id} .stmt { margin: 0; font-size: ${fs}px; line-height: 1.12; letter-spacing: ${c.type.displayTracking};
      max-width: ${maxW}px; text-wrap: balance; text-align: center; }`;
  const stagger = c.e.stagger * 0.6;
  const js = [rise(c, `#${c.id} .stmt .wi`, c.t0, stagger)];
  if (b.highlight) {
    const at = c.t0 + c.intro - 0.55;
    js.push(tw("fromTo", `#${c.id} .mark`, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, at));
    js.push(tw("to", `#${c.id} .hl .wi`, { color: c.pal.onAccent, duration: 0.25, ease: "none" }, at + 0.15));
  }
  return { html, css, js };
}

export function quote(b: B<"quote">, c: Ctx): SceneOut {
  const maxW = c.portrait ? c.availW : Math.round(c.availW * 0.8);
  const fs = fitSize(b.text, c.size.display, maxW, c.type.display.family, c.portrait ? 7 : 4);
  const html = `
    <div class="qm">&ldquo;</div>
    <blockquote class="q">${maskedWords(b.text)}</blockquote>
    ${b.author ? `<div class="au">&mdash; ${esc(b.author)}</div>` : ""}`;
  const css = `
    #${c.id} .qm { font-size: ${Math.round(c.size.hero * 2)}px; line-height: 1; height: 0.5em; color: ${c.pal.accent};
      font-family: "Instrument Serif"; font-style: italic; }
    #${c.id} .q { margin: 0; font-size: ${fs}px; line-height: 1.18; letter-spacing: ${c.type.displayTracking};
      max-width: ${maxW}px; text-wrap: balance; text-align: center; }
    #${c.id} .au { margin-top: 1.4em; ${fontFace(c.type.body)} font-size: ${c.size.caption * 1.15}px; color: ${c.pal.muted};
      letter-spacing: 0.06em; }`;
  const words = b.text.split(/\s+/).length;
  const js = [
    tw("fromTo", `#${c.id} .qm`, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: c.e.enter, ease: c.e.ease }, c.t0),
    rise(c, `#${c.id} .q .wi`, c.t0 + 0.15, r(Math.min(0.04, 0.45 / words))),
  ];
  if (b.author) js.push(fadeUp(c, `#${c.id} .au`, c.t0 + c.e.enter));
  return { html, css, js };
}

export function end(b: B<"end">, c: Ctx): SceneOut {
  const fs = fitSize(b.text, c.size.hero, c.availW, c.type.display.family, c.portrait ? 3 : 2);
  const orb = Math.round(Math.min(c.fmt.width, c.fmt.height) * 0.9);
  const html = `
    <div class="orb"></div>
    <h2 class="endt">${maskedWords(b.text)}</h2>
    ${b.cta ? `<div class="cta">${esc(b.cta)}</div>` : ""}`;
  const css = `
    #${c.id} .orb { position: absolute; inset: 0; margin: auto; width: ${orb}px; height: ${orb}px; border-radius: 50%;
      background: radial-gradient(closest-side, ${c.pal.glow}, transparent); }
    #${c.id} .endt { position: relative; margin: 0; font-size: ${fs}px; line-height: 1.02; letter-spacing: ${c.type.displayTracking};
      max-width: ${c.availW}px; text-wrap: balance; text-align: center; }
    #${c.id} .cta { position: relative; margin-top: 1.3em; padding: 0.55em 1.2em; border-radius: 999px; ${fontFace(c.type.body)}
      font-size: ${c.size.body}px; background: ${c.pal.accent}; color: ${c.pal.onAccent}; }`;
  const js = [
    tw("fromTo", `#${c.id} .orb`, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: c.e.enter * 1.6, ease: "sine.out" }, c.t0),
    rise(c, `#${c.id} .endt .wi`, c.t0 + 0.1),
  ];
  if (b.cta) js.push(tw("fromTo", `#${c.id} .cta`, { opacity: 0, scale: 0.85, y: c.travel / 3 },
    { opacity: 1, scale: 1, y: 0, duration: c.e.enter, ease: "back.out(1.6)" }, c.t0 + c.e.enter * 0.6));
  return { html, css, js };
}
