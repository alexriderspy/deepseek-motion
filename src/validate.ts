import { z } from "zod";
import { Beat, Spec } from "./spec.ts";
import { FORMATS, MAX_BEAT } from "./tokens.ts";
import { checkCode } from "./custom.ts";
import { plan } from "./timing.ts";

// Every message names the exact field and says how to fix it, so a cheap
// model can repair its own spec in one retry.

export interface Problem {
  path: string;
  message: string;
}

export type CheckResult =
  | { ok: true; spec: Spec; warnings: Problem[]; duration: number }
  | { ok: false; problems: Problem[] };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function limitWords(out: Problem[], path: string, text: string | undefined, max: number) {
  if (!text) return;
  const n = words(text);
  if (n > max) out.push({ path, message: `"${text}" is ${n} words; the limit is ${max}. Cut it to the key phrase.` });
}

function beatProblems(b: Beat, p: string): Problem[] {
  const out: Problem[] = [];
  switch (b.scene) {
    case "title":
      limitWords(out, `${p}.text`, b.text, 7);
      limitWords(out, `${p}.kicker`, b.kicker, 4);
      break;
    case "statement":
      limitWords(out, `${p}.text`, b.text, 16);
      if (b.highlight && !b.text.toLowerCase().includes(b.highlight.toLowerCase()))
        out.push({ path: `${p}.highlight`, message: `"${b.highlight}" does not appear in text. Copy a word or phrase from text exactly, or remove highlight.` });
      break;
    case "stat":
      limitWords(out, `${p}.label`, b.label, 10);
      if (Math.abs(b.value) >= 1e7)
        out.push({ path: `${p}.value`, message: `${b.value} is too many digits to read. Scale it down and use a suffix, e.g. value 12 with suffix "M".` });
      break;
    case "list":
      limitWords(out, `${p}.title`, b.title, 6);
      b.items.forEach((it, i) => limitWords(out, `${p}.items[${i}]`, it, 6));
      break;
    case "quote":
      limitWords(out, `${p}.text`, b.text, 24);
      if (/^["“'‘]/.test(b.text))
        out.push({ path: `${p}.text`, message: "Remove the quotation marks; the scene draws its own." });
      break;
    case "compare":
      limitWords(out, `${p}.title`, b.title, 6);
      limitWords(out, `${p}.left.label`, b.left.label, 4);
      limitWords(out, `${p}.right.label`, b.right.label, 4);
      limitWords(out, `${p}.left.value`, b.left.value, 2);
      limitWords(out, `${p}.right.value`, b.right.value, 2);
      break;
    case "bars":
      limitWords(out, `${p}.title`, b.title, 6);
      b.bars.forEach((bar, i) => limitWords(out, `${p}.bars[${i}].label`, bar.label, 3));
      if (b.bars.every((bar) => bar.value === 0))
        out.push({ path: `${p}.bars`, message: "All values are 0; nothing to draw. Use real numbers." });
      break;
    case "code":
      b.lines.forEach((l, i) => {
        if (l.length > 46) out.push({ path: `${p}.lines[${i}]`, message: `Line is ${l.length} characters; the limit is 46. Split it or shorten names.` });
      });
      break;
    case "flow":
      limitWords(out, `${p}.title`, b.title, 6);
      b.nodes.forEach((n, i) => limitWords(out, `${p}.nodes[${i}]`, n, 3));
      limitWords(out, `${p}.caption`, b.caption, 12);
      break;
    case "steps":
      limitWords(out, `${p}.title`, b.title, 6);
      b.steps.forEach((st, i) => limitWords(out, `${p}.steps[${i}]`, st, 5));
      break;
    case "custom":
      limitWords(out, `${p}.brief`, b.brief, 50);
      break;
    case "end":
      limitWords(out, `${p}.text`, b.text, 6);
      limitWords(out, `${p}.cta`, b.cta, 6);
      break;
  }
  return out;
}

function zodProblems(err: z.ZodError): Problem[] {
  return err.issues.map((i) => {
    const path = i.path.map((k) => (typeof k === "number" ? `[${k}]` : `.${String(k)}`)).join("").replace(/^\./, "") || "(root)";
    let message = i.message;
    if (i.code === "invalid_union" && i.path.at(-1) === "scene")
      message = "Unknown scene. Use one of: title, statement, stat, list, quote, compare, bars, code, flow, steps, custom, end.";
    return { path, message };
  });
}

export interface CheckOptions {
  // Custom beats must carry code (anything that builds the video). Off while
  // a spec is still being written and code comes in a second step.
  requireCode?: boolean;
}

export function check(input: unknown, opts: CheckOptions = {}): CheckResult {
  const parsed = Spec.safeParse(input);
  if (!parsed.success) {
    // Also run the copy checks on every beat that does parse, so the model
    // gets all its problems in one round instead of one layer per retry.
    const beats = (input as { beats?: unknown })?.beats;
    const extra = Array.isArray(beats)
      ? beats.flatMap((b, i) => {
        const one = Beat.safeParse(b);
        return one.success ? beatProblems(one.data, `beats[${i}]`) : [];
      })
      : [];
    return { ok: false, problems: [...zodProblems(parsed.error), ...extra] };
  }
  const spec = parsed.data;

  const problems = spec.beats.flatMap((b, i) => beatProblems(b, `beats[${i}]`));
  const fmt = FORMATS[spec.format];
  spec.beats.forEach((b, i) => {
    if (b.scene !== "custom") return;
    if (!b.code) {
      if (opts.requireCode) problems.push({ path: `beats[${i}].code`, message: "Custom beat has no code. Write the body of draw(ctx, t, api) for its brief (see the custom scene API in the guide)." });
      return;
    }
    const res = checkCode(b.code, { W: fmt.width, H: fmt.height, dur: b.seconds });
    res.problems.forEach((m) => problems.push({ path: `beats[${i}].code`, message: m }));
  });
  const pl = plan(spec);
  if (pl.overflow) {
    const avg = pl.overflow.minTotal / spec.beats.length;
    const drop = Math.max(1, Math.ceil((pl.overflow.minTotal - pl.overflow.target) / avg));
    problems.push({ path: "beats", message: `${spec.beats.length} beats need at least ${pl.overflow.minTotal}s but duration is ${pl.overflow.target}s. Remove ${drop} beat(s), or shorten the text.` });
  }
  if (pl.underflow) {
    const add = Math.max(1, Math.round((pl.underflow.target - pl.underflow.total) / 3.5));
    problems.push({ path: "beats", message: `These beats only fill ${pl.underflow.total}s of the ${pl.underflow.target}s requested. Add about ${add} more beat(s).` });
  }
  if (problems.length) return { ok: false, problems };

  const warnings: Problem[] = [];
  const durations = pl.durations;
  durations.forEach((d, i) => {
    if (d >= MAX_BEAT) warnings.push({ path: `beats[${i}]`, message: `This beat runs ${d.toFixed(1)}s, which drags. Consider splitting it into two beats.` });
  });
  for (let i = 1; i < spec.beats.length; i++) {
    if (spec.beats[i].scene === spec.beats[i - 1].scene && spec.beats[i].scene !== "statement")
      warnings.push({ path: `beats[${i}]`, message: `Two "${spec.beats[i].scene}" beats in a row feel repetitive. Vary the scene types.` });
  }
  if (spec.format !== "16:9") spec.beats.forEach((b, i) => {
    if (b.scene === "code" && b.lines.some((l) => l.length > 32))
      warnings.push({ path: `beats[${i}].lines`, message: `In ${spec.format}, code lines over 32 characters render small. Shorten them if you can.` });
  });
  const stats = spec.beats.filter((b) => b.scene === "stat").length;
  if (stats > 2) warnings.push({ path: "beats", message: `${stats} stat beats; big numbers lose punch when repeated. Keep at most 2.` });
  const duration = pl.total;
  return { ok: true, spec, warnings, duration };
}

export function formatProblems(problems: Problem[]): string {
  return problems.map((p) => `- ${p.path}: ${p.message}`).join("\n");
}
