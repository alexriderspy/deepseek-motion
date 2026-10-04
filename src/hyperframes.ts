import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Spec } from "./spec.ts";
import type { Timeline } from "./compile.ts";
import { introTime } from "./timing.ts";
import { ENERGIES } from "./tokens.ts";

const require = createRequire(import.meta.url);

function hfBin(): string {
  const pkg = dirname(require.resolve("hyperframes/package.json"));
  const { bin } = require("hyperframes/package.json") as { bin: string | Record<string, string> };
  return join(pkg, typeof bin === "string" ? bin : bin.hyperframes ?? Object.values(bin)[0]);
}

export function run(args: string[], opts: { quiet?: boolean } = {}): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [hfBin(), ...args], { env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", NO_COLOR: "1" } });
    let output = "";
    const take = (d: Buffer) => { output += d; if (!opts.quiet) process.stderr.write(d); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("close", (code) => done({ code: code ?? 1, output }));
  });
}

// One moment per beat after its entrance has settled: what a viewer sees
// while reading. These are the frames worth reviewing.
export function settleTimes(spec: Spec, tl: Timeline): number[] {
  const e = ENERGIES[spec.energy];
  return tl.beats.map((b, i) => {
    const at = b.start + Math.min(b.duration - e.exit - 0.05, introTime(spec.beats[i], e) + 0.25);
    return Math.round(at * 100) / 100;
  });
}

export async function snapshot(dir: string, times: number[]): Promise<{ ok: boolean; files: string[]; output: string }> {
  const out = join(dir, "snapshots");
  const res = await run(["snapshot", dir, "--at", times.join(","), "--no-end", "--describe", "false", "-o", out], { quiet: true });
  const files = existsSync(out) ? readdirSync(out).filter((f) => f.endsWith(".png")).sort().map((f) => join(out, f)) : [];
  return { ok: res.code === 0, files, output: res.output };
}

export async function lint(dir: string): Promise<{ ok: boolean; output: string }> {
  const res = await run(["check", dir], { quiet: true });
  return { ok: res.code === 0, output: res.output };
}

export async function render(dir: string, output: string, quality: "draft" | "looks" | "delivery" = "looks"): Promise<{ ok: boolean; output: string }> {
  const res = await run(["render", dir, "-o", output, "-q", quality, "--quiet"], { quiet: true });
  return { ok: res.code === 0 && existsSync(output), output: res.output };
}
