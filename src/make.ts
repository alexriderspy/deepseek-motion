import { guide, seedOf } from "./guide.ts";
import { check, formatProblems, type CheckResult } from "./validate.ts";
import type { Spec } from "./spec.ts";

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

interface Msg { role: "system" | "user" | "assistant"; content: string }

export interface Usage { prompt: number; completion: number }

async function chat(cfg: ModelConfig, messages: Msg[]): Promise<{ text: string; usage: Usage }> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, response_format: { type: "json_object" } }),
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
