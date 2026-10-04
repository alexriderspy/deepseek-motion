import { readFileSync } from "node:fs";
import { guide, seedOf } from "./guide.ts";
import { check, formatProblems, type CheckResult } from "./validate.ts";
import type { Spec } from "./spec.ts";
import { checkCode, codePrompt, extractCode } from "./custom.ts";
import { FORMATS } from "./tokens.ts";

// Any OpenAI-compatible chat endpoint works: DeepSeek, OpenRouter, Ollama,
// vLLM, LM Studio. DeepSeek is the default because it is the cheapest model
// that reliably fills the spec.

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function modelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  const env = process.env;
  return {
    baseUrl: overrides.baseUrl ?? env.DEEPSEEK_MOTION_BASE_URL ?? "https://api.deepseek.com",
    apiKey: overrides.apiKey ?? env.DEEPSEEK_MOTION_API_KEY ?? env.DEEPSEEK_API_KEY ?? "",
    model: overrides.model ?? env.DEEPSEEK_MOTION_MODEL ?? "deepseek-flash",
  };
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface Msg { role: "system" | "user" | "assistant"; content: string | Part[] }

export interface Usage { prompt: number; completion: number }

async function chat(cfg: ModelConfig, messages: Msg[], json = true): Promise<{ text: string; usage: Usage }> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(`${cfg.model} returned ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
  return {
    text: data.choices[0]?.message?.content ?? "",
    usage: { prompt: data.usage?.prompt_tokens ?? 0, completion: data.usage?.completion_tokens ?? 0 },
  };
}

// Models sometimes wrap JSON in prose or fences even in JSON mode.
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(body.slice(start, end + 1));
}

export interface MakeResult {
  spec: Spec;
  attempts: number;
  usage: Usage;
  warnings: string;
  duration: number;
}

export async function makeSpec(prompt: string, cfg: ModelConfig, opts: { maxAttempts?: number; log?: (s: string) => void } = {}): Promise<MakeResult> {
  const log = opts.log ?? (() => {});
  const messages: Msg[] = [
    { role: "system", content: guide(seedOf(prompt)) },
    { role: "user", content: prompt },
  ];
  const usage: Usage = { prompt: 0, completion: 0 };
  const max = opts.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= max; attempt++) {
    const reply = await chat(cfg, messages);
    usage.prompt += reply.usage.prompt;
    usage.completion += reply.usage.completion;
    messages.push({ role: "assistant", content: reply.text });
    let res: CheckResult;
    try {
      res = check(extractJson(reply.text));
    } catch (err) {
      res = { ok: false, problems: [{ path: "(reply)", message: `Not valid JSON (${(err as Error).message}). Reply with one JSON object only.` }] };
    }
    if (res.ok) {
      return { spec: res.spec, attempts: attempt, usage, warnings: formatProblems(res.warnings), duration: res.duration };
    }
    const problems = formatProblems(res.problems);
    log(`attempt ${attempt}: ${res.problems.length} problem(s)\n${problems}`);
    messages.push({ role: "user", content: `The spec has problems. Fix exactly these and reply with the full corrected JSON:\n${problems}` });
  }
  throw new Error(`no valid spec after ${max} attempts`);
}

const add = (u: Usage, v: Usage) => { u.prompt += v.prompt; u.completion += v.completion; };

function neighbours(spec: Spec, i: number): string {
  const say = (j: number) => {
    const b = spec.beats[j];
    if (!b) return "nothing";
    return `${b.scene} ${JSON.stringify(b.scene === "custom" ? b.brief : { ...b, scene: undefined, hold: undefined }).slice(0, 120)}`;
  };
  return `before: ${say(i - 1)}; after: ${say(i + 1)}.`;
}

// Second step: write draw() code for every custom beat that has none,
// retrying with the smoke test's findings.
export async function writeCustomCode(spec: Spec, cfg: ModelConfig, opts: { log?: (s: string) => void; feedback?: Map<number, string> } = {}): Promise<Usage> {
  const log = opts.log ?? (() => {});
  const usage: Usage = { prompt: 0, completion: 0 };
  const fmt = FORMATS[spec.format];
  const jobs = spec.beats.map((b, i) => ({ b, i })).filter(({ b, i }) => b.scene === "custom" && (!b.code || opts.feedback?.has(i)));
  await Promise.all(jobs.map(async ({ b, i }) => {
    if (b.scene !== "custom") return;
    const env = { W: fmt.width, H: fmt.height, dur: b.seconds };
    const messages: Msg[] = [{ role: "user", content: codePrompt(b.brief, { ...env, videoTitle: spec.title, neighbours: neighbours(spec, i) }) }];
    const review = opts.feedback?.get(i);
    if (review && b.code) {
      messages.push({ role: "assistant", content: "```js\n" + b.code + "\n```" });
      messages.push({ role: "user", content: `A reviewer watched frames of this scene and found:\n${review}\nRewrite the scene to fix these. Same rules. Reply with only the function body in one \`\`\`js block.` });
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const reply = await chat(cfg, messages, false);
      add(usage, reply.usage);
      const code = extractCode(reply.text);
      const res = checkCode(code, env);
      if (res.ok) { b.code = code; log(`beats[${i}] custom code ok after ${attempt} attempt(s)`); return; }
      log(`beats[${i}] custom code attempt ${attempt}: ${res.problems.join(" | ")}`);
      messages.push({ role: "assistant", content: reply.text });
      messages.push({ role: "user", content: `The code has problems:\n- ${res.problems.join("\n- ")}\nFix them and reply with the full function body in one \`\`\`js block.` });
    }
    throw new Error(`beats[${i}]: no working custom code after 3 attempts`);
  }));
  return usage;
}

export interface Review { index: number; score: number; problems: string[] }

// The model looks at frames of its own custom scenes. Cheap vision models
// are literal, so the question is narrow: does it show the brief, and what
// concretely looks broken or amateur.
export async function reviewCustom(spec: Spec, frames: Map<number, string[]>, cfg: ModelConfig): Promise<{ reviews: Review[]; usage: Usage }> {
  const usage: Usage = { prompt: 0, completion: 0 };
  const reviews: Review[] = [];
  await Promise.all([...frames].map(async ([i, files]) => {
    const b = spec.beats[i];
    if (b.scene !== "custom") return;
    const content: Part[] = [{ type: "text", text: `These are ${files.length} frames, in order, from one animated scene of a motion-graphics video. The brief was: "${b.brief}".
Judge it like a senior motion designer. Score 1-10 where 7 means you would ship it.
List only concrete, fixable problems: text cut off or overlapping, things off-screen, too small to read on a phone, empty or unbalanced frame, the brief not recognisable, cluttered, looks amateur (and why).
Reply as JSON: {"score": number, "problems": ["..."]}` }];
    for (const f of files) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${readFileSync(f).toString("base64")}` } });
    const reply = await chat(cfg, [{ role: "user", content }], true);
    add(usage, reply.usage);
    try {
      const j = extractJson(reply.text) as { score?: number; problems?: string[] };
      reviews.push({ index: i, score: Number(j.score) || 0, problems: (j.problems ?? []).map(String) });
    } catch {
      reviews.push({ index: i, score: 10, problems: [] });
    }
  }));
  return { reviews: reviews.sort((a, b) => a.index - b.index), usage };
}
