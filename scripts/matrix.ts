// Stress test: the kitchen sink (every scene at its copy limits) in every
// format and type pair, each through HyperFrames' layout + contrast audit.
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { check } from "../src/validate.ts";
import { writeProject } from "../src/compile.ts";
import { lint } from "../src/hyperframes.ts";
import { FORMATS, TYPE_PAIRS } from "../src/tokens.ts";
import type { Spec } from "../src/spec.ts";

const root = process.argv[2] ?? "out/matrix";
const base = check(JSON.parse(readFileSync("examples/kitchen-sink.json", "utf8")));
if (!base.ok) throw new Error("kitchen sink invalid");
const jobs = Object.keys(FORMATS).flatMap((format) => Object.keys(TYPE_PAIRS).map((type) => ({ format, type })));
let failed = 0;
for (let i = 0; i < jobs.length; i += 4) {
  await Promise.all(jobs.slice(i, i + 4).map(async ({ format, type }) => {
    const dir = join(root, `${format.replace(":", "x")}-${type}`);
    mkdirSync(dir, { recursive: true });
    writeProject({ ...base.spec, format, type } as Spec, dir);
    const l = await lint(dir);
    // Monolithic-file advice (split into sub-compositions) is expected for generated output.
    const lines = l.output.split("\n");
    const errs = lines.filter((x) => /^\s*✗/.test(x)).length;
    const warns = lines.filter((x) => /^\s*⚠/.test(x) && !/nested_structure_needs_subcomposition|timeline_track_too_dense/.test(x)).length;
    if (!l.ok || errs || warns) failed++;
    console.log(`${l.ok ? "pass" : "FAIL"} ${format.padEnd(5)} ${type.padEnd(10)} errors=${errs} warnings=${warns}  ${dir}`);
  }));
}
process.exit(failed ? 1 : 0);
