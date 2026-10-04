import type { Beat } from "../spec.ts";
import { type Ctx, type SceneOut, esc, tw } from "./kit.ts";

const TOKEN = /(\/\/.*|(?<=^|\s)#.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|import|from|export|def|class|if|else|for|while|await|async|new|true|false|null|None|True|False|in|of|as|with|print|fn|pub|use|type|interface)\b/g;

// Tiny highlighter: comments, strings, numbers, keywords. Good enough to
// read as code on screen; not a parser.
function highlight(line: string): string {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    out += esc(line.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "n" : "k";
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index! + m[0].length;
  }
  return out + esc(line.slice(last));
}

export function code(b: Extract<Beat, { scene: "code" }>, c: Ctx): SceneOut {
  const winW = c.portrait ? c.availW : Math.round(c.availW * 0.74);
  const maxChars = Math.max(20, ...b.lines.map((l) => l.length));
  const pad = Math.round(c.size.body * 1.1);
  const fs = Math.floor(Math.min(c.size.body * 1.05, (winW - pad * 2) / (maxChars * 0.61)));
  const html = `
    <div class="win">
      <div class="chrome"><i></i><i></i><i></i>${b.title ? `<span class="wt">${esc(b.title)}</span>` : ""}</div>
      <pre class="src">${b.lines.map((l) => `<span class="ln"><span class="lt">${highlight(l) || " "}</span></span>`).join("")}</pre>
    </div>`;
  const css = `
    #${c.id} .win { width: ${winW}px; background: ${c.pal.surface}; border-radius: ${Math.round(pad * 0.8)}px; overflow: hidden;
      box-shadow: 0 ${pad}px ${pad * 3}px rgba(0,0,0,0.35); border: 2px solid color-mix(in srgb, ${c.pal.ink} 8%, transparent); }
    #${c.id} .chrome { display: flex; align-items: center; gap: ${Math.round(pad * 0.35)}px; padding: ${Math.round(pad * 0.6)}px ${pad}px;
      border-bottom: 2px solid color-mix(in srgb, ${c.pal.ink} 6%, transparent); }
    #${c.id} .chrome i { display: block; width: ${Math.round(pad * 0.42)}px; height: ${Math.round(pad * 0.42)}px; border-radius: 50%; background: #ff5f57; }
    #${c.id} .chrome i:nth-child(2) { background: #febc2e; }
    #${c.id} .chrome i:nth-child(3) { background: #28c840; }
    #${c.id} .wt { margin-left: auto; margin-right: auto; padding-right: ${pad * 1.5}px; font-family: "JetBrains Mono"; font-weight: 500;
      font-size: ${Math.round(fs * 0.7)}px; color: ${c.pal.muted}; }
    #${c.id} .src { margin: 0; padding: ${pad}px; font-family: "JetBrains Mono"; font-weight: 500; font-size: ${fs}px; line-height: 1.6;
      color: ${c.pal.ink}; white-space: pre; }
    #${c.id} .ln { display: block; }
    #${c.id} .lt { display: inline-block; }
    #${c.id} .k { color: ${c.pal.accentOnSurface}; }
    #${c.id} .s { color: color-mix(in srgb, ${c.pal.accentOnSurface} 60%, ${c.pal.ink}); }
    #${c.id} .n { color: ${c.pal.accentOnSurface}; }
    #${c.id} .c { color: ${c.pal.muted}; font-style: italic; }`;
  const js = [
    tw("fromTo", `#${c.id} .win`, { opacity: 0, y: c.travel, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: c.e.enter, ease: c.e.ease }, c.t0),
  ];
  b.lines.forEach((l, i) => {
    const steps = Math.max(1, l.length);
    js.push(tw("fromTo", `#${c.id} .ln:nth-child(${i + 1}) .lt`, { clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0% 0 0)", duration: Math.min(0.3, 0.05 + steps * 0.008), ease: `steps(${steps})` }, c.t0 + 0.4 + i * 0.32));
  });
  return { html, css, js };
}
