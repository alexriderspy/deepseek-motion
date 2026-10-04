#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { check, formatProblems } from "./validate.ts";
import { writeProject } from "./compile.ts";
import { lint, render, settleTimes, snapshot } from "./hyperframes.ts";
import { makeSpec, modelConfig, reviewCustom, writeCustomCode, type Review } from "./make.ts";
import { guide } from "./guide.ts";
import type { Spec } from "./spec.ts";

const HELP = `deepseek-motion: motion graphics from any LLM

  deepseek-motion make "<prompt>"   ask a model for a spec, then build it
  deepseek-motion check <spec.json> validate a spec
  deepseek-motion build <spec.json> write the HyperFrames project
  deepseek-motion preview <spec>    build + one PNG per beat
  deepseek-motion render <spec>     build + render final.mp4
  deepseek-motion guide             print the spec guide models are given
  deepseek-motion mcp               run the MCP server on stdio

Options:
  -o, --out <dir>        project folder (default: out/<title>)
  -q, --quality <q>      draft | looks | delivery (default: looks)
  --format <f>           make: force 16:9 | 9:16 | 1:1 | 4:5
  --model <id>           make: model id (default: deepseek-flash)
  --base-url <url>       make: OpenAI-compatible endpoint (default: DeepSeek)
  --no-render            make: stop after preview frames
  --review-rounds <n>    make: times the model reviews and redraws its custom scenes (default 1)

Env: DEEPSEEK_API_KEY, or DEEPSEEK_MOTION_API_KEY + DEEPSEEK_MOTION_BASE_URL + DEEPSEEK_MOTION_MODEL.`;

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", short: "o" },
    quality: { type: "string", short: "q", default: "looks" },
    format: { type: "string" },
    model: { type: "string" },
    "base-url": { type: "string" },
    "no-render": { type: "boolean", default: false },
    "review-rounds": { type: "string", default: "1" },
    help: { type: "boolean", short: "h" },
  },
});
const [cmd, arg] = positionals;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
const outDir = (spec: Spec) => resolve(o.out ?? join("out", slug(spec.title)));
const quality = o.quality as "draft" | "looks" | "delivery";

function loadSpec(path: string | undefined): Spec {
  if (!path) die("missing <spec.json>");
  const res = check(JSON.parse(readFileSync(path, "utf8")), { requireCode: true });
  if (!res.ok) die(`spec has problems:\n${formatProblems(res.problems)}`);
  if (res.warnings.length) console.log(`warnings:\n${formatProblems(res.warnings)}`);
  return res.spec;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function build(spec: Spec, opts: { preview?: boolean; render?: boolean }) {
  const dir = outDir(spec);
  mkdirSync(dir, { recursive: true });
  const c = writeProject(spec, dir);
  console.log(`built ${c.beats.length} beats, ${c.duration}s, ${spec.format} -> ${dir}`);
  const l = await lint(dir);
  if (!l.ok) die(`hyperframes check failed:\n${l.output}`);
  if (opts.preview) {
    const s = await snapshot(dir, settleTimes(spec, c));
    if (!s.ok) die(s.output);
    console.log(`preview frames:\n${s.files.map((f) => `  ${f}`).join("\n")}`);
  }
  if (opts.render) {
    const file = join(dir, "final.mp4");
    console.log(`rendering (${quality})...`);
    const r = await render(dir, file, quality);
    if (!r.ok) die(`render failed:\n${r.output}`);
    console.log(`done: ${file}`);
  }
}

if (o.help || !cmd) {
  console.log(HELP);
} else if (cmd === "guide") {
  console.log(guide());
} else if (cmd === "check") {
  const spec = loadSpec(arg);
  console.log(`ok: ${spec.beats.length} beats`);
} else if (cmd === "build") {
  await build(loadSpec(arg), {});
} else if (cmd === "preview") {
  await build(loadSpec(arg), { preview: true });
} else if (cmd === "render") {
  await build(loadSpec(arg), { render: true });
} else if (cmd === "make") {
  if (!arg) die('usage: deepseek-motion make "<prompt>"');
  const cfg = modelConfig({ model: o.model, baseUrl: o["base-url"] });
  if (!cfg.apiKey && !/localhost|127\.0\.0\.1/.test(cfg.baseUrl)) die("no API key: set DEEPSEEK_API_KEY or DEEPSEEK_MOTION_API_KEY");
  const prompt = o.format ? `${arg}\n\nUse format "${o.format}".` : arg;
  console.log(`asking ${cfg.model}...`);
  const t = Date.now();
  const res = await makeSpec(prompt, cfg, { log: (s) => console.log(s) });
  if (o.format) res.spec.format = o.format as Spec["format"];
  console.log(`spec ok after ${res.attempts} attempt(s) in ${((Date.now() - t) / 1000).toFixed(1)}s, ${res.usage.prompt}+${res.usage.completion} tokens`);
  if (res.warnings) console.log(`warnings:\n${res.warnings}`);
  const log = (s: string) => console.log(s);
  const customs = res.spec.beats.map((b, i) => ({ b, i })).filter(({ b }) => b.scene === "custom");
  if (customs.length) {
    console.log(`writing code for ${customs.length} custom scene(s)...`);
    const u = await writeCustomCode(res.spec, cfg, { log });
    res.usage.prompt += u.prompt; res.usage.completion += u.completion;
  }
  const dir = outDir(res.spec);
  mkdirSync(dir, { recursive: true });
  const reviews: Review[][] = [];
  for (let round = 0; round < Number(o["review-rounds"]) && customs.length; round++) {
    const c = writeProject(res.spec, dir);
    const times = customs.flatMap(({ i }) => [0.35, 0.65, 0.95].map((k) => +(c.beats[i].start + c.beats[i].duration * k).toFixed(2)));
    const s = await snapshot(dir, times, `review-${round}`);
    if (!s.ok) die(s.output);
    const frames = new Map(customs.map(({ i }, n) => [i, s.files.slice(n * 3, n * 3 + 3)]));
    const r = await reviewCustom(res.spec, frames, cfg);
    res.usage.prompt += r.usage.prompt; res.usage.completion += r.usage.completion;
    reviews.push(r.reviews);
    for (const rv of r.reviews) console.log(`review beats[${rv.index}]: ${rv.score}/10${rv.problems.length ? ` - ${rv.problems.join("; ")}` : ""}`);
    const weak = r.reviews.filter((rv) => rv.score < 7 && rv.problems.length);
    if (!weak.length) break;
    console.log(`redrawing ${weak.length} scene(s)...`);
    const u = await writeCustomCode(res.spec, cfg, { log, feedback: new Map(weak.map((rv) => [rv.index, rv.problems.map((p) => `- ${p}`).join("\n")])) });
    res.usage.prompt += u.prompt; res.usage.completion += u.completion;
  }
  console.log(`total ${res.usage.prompt}+${res.usage.completion} tokens`);
  await build(res.spec, { preview: true, render: !o["no-render"] });
  writeFileSync(join(dir, "make.json"), JSON.stringify({ prompt: arg, model: cfg.model, ...res, reviews }, null, 2) + "\n");
} else if (cmd === "mcp") {
  await import("./mcp.ts");
} else {
  die(`unknown command "${cmd}"\n\n${HELP}`);
}
