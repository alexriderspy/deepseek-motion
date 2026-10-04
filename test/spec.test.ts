import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { check } from "../src/validate.ts";
import { compile } from "../src/compile.ts";
import { FORMATS, PALETTES, TYPE_PAIRS, ENERGIES } from "../src/tokens.ts";
import type { Spec } from "../src/spec.ts";

const examples = readdirSync("examples").filter((f) => f.endsWith(".json"));
const load = (f: string) => JSON.parse(readFileSync(`examples/${f}`, "utf8"));

for (const f of examples) {
  test(`example ${f} is valid and compiles`, () => {
    const res = check(load(f));
    assert.ok(res.ok, res.ok ? "" : JSON.stringify(res.problems));
    const c = compile(res.spec);
    assert.match(c.html, /window\.__timelines\["main"\] = tl;/);
    assert.equal(c.beats.length, res.spec.beats.length);
    assert.ok(Math.abs(c.duration - res.duration) < 0.05);
  });
}

test("every format, palette, type pair and energy compiles the kitchen sink", () => {
  const base = check(load("kitchen-sink.json"));
  assert.ok(base.ok);
  for (const format of Object.keys(FORMATS)) for (const palette of Object.keys(PALETTES))
    for (const type of Object.keys(TYPE_PAIRS)) for (const energy of Object.keys(ENERGIES)) {
      const html = compile({ ...base.spec, format, palette, type, energy } as Spec).html;
      assert.doesNotMatch(html, /undefined|NaN/, `${format} ${palette} ${type} ${energy}`);
    }
});

test("copy limits come back as fix-it messages with exact paths", () => {
  const res = check({ title: "t", beats: [
    { scene: "title", text: "one two three four five six seven eight" },
    { scene: "statement", text: "hello world", highlight: "goodbye" },
    { scene: "code", lines: ["x".repeat(60)] },
  ] });
  assert.ok(!res.ok);
  const paths = res.problems.map((p) => p.path);
  assert.deepEqual(paths, ["beats[0].text", "beats[1].highlight", "beats[2].lines[0]"]);
  assert.match(res.problems[0].message, /8 words; the limit is 7/);
});

test("schema and copy problems are reported together", () => {
  const res = check({ title: "t", palette: "rainbow", beats: [{ scene: "title", text: "a b c d e f g h" }, { scene: "chart" }] });
  assert.ok(!res.ok);
  assert.deepEqual(res.problems.map((p) => p.path).sort(), ["beats[0].text", "beats[1].scene", "palette"]);
});

test("user text is escaped", () => {
  const res = check({ title: "t", beats: [{ scene: "title", text: "<script>alert(1)</script> & co" }] });
  assert.ok(res.ok);
  const html = compile(res.spec).html;
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("hold time follows reading time and an explicit hold wins", () => {
  const short = check({ title: "t", beats: [{ scene: "statement", text: "Hi." }] });
  const long = check({ title: "t", beats: [{ scene: "statement", text: "one two three four five six seven eight nine ten eleven twelve" }] });
  const fixed = check({ title: "t", beats: [{ scene: "statement", text: "Hi.", hold: 5 }] });
  assert.ok(short.ok && long.ok && fixed.ok);
  assert.ok(long.duration > short.duration + 2);
  assert.ok(fixed.duration > short.duration + 3);
});

test("every palette is readable", async () => {
  const { contrast, readable } = await import("../src/color.ts");
  for (const [name, p] of Object.entries(PALETTES)) {
    assert.ok(contrast(p.ink, p.bg) >= 7, `${name} ink`);
    assert.ok(contrast(p.ink, p.surface) >= 7, `${name} ink on surface`);
    assert.ok(contrast(p.muted, p.bg) >= 4.5, `${name} muted`);
    assert.ok(contrast(p.muted, p.surface) >= 4.5, `${name} muted on surface`);
    assert.ok(contrast(p.accent, p.bg) >= 3, `${name} accent (large text)`);
    assert.ok(contrast(p.onAccent, p.accent) >= 4, `${name} text on accent`);
    assert.ok(contrast(readable(p.accent, p.ink, p.bg), p.bg) >= 4.5, `${name} small accent text`);
  }
});

test("a requested duration is hit, and an impossible one asks to cut beats", () => {
  const beats = [
    { scene: "title", text: "Fifteen seconds flat" },
    { scene: "steps", steps: ["One", "Two", "Three"] },
    { scene: "flow", nodes: ["In", "Out"] },
    { scene: "end", text: "Done" },
  ];
  for (const duration of [12, 18]) {
    const res = check({ title: "t", duration, beats });
    assert.ok(res.ok);
    assert.ok(Math.abs(res.duration - duration) < 0.6, `${res.duration} vs ${duration}`);
    assert.ok(Math.abs(compile(res.spec).duration - duration) < 0.6);
  }
  const tight = check({ title: "t", duration: 6, beats });
  assert.ok(!tight.ok);
  assert.match(tight.problems[0].message, /Remove \d+ beat/);
  const long = check({ title: "t", duration: 60, beats });
  assert.ok(!long.ok);
  assert.match(long.problems[0].message, /Add about \d+ more beat/);
});

test("fast energies cut with a wipe, slow ones fade", () => {
  const spec = (energy: string) => check({ title: "t", energy, beats: [{ scene: "title", text: "A" }, { scene: "end", text: "B" }] });
  const snappy = spec("snappy"), calm = spec("calm");
  assert.ok(snappy.ok && calm.ok);
  assert.match(compile(snappy.spec).html, /class="wipe"/);
  assert.doesNotMatch(compile(calm.spec).html, /class="wipe"/);
});

test("the guide lists options in a per-prompt order", async () => {
  const { guide, seedOf } = await import("../src/guide.ts");
  const first = (g: string) => g.split("Palettes:\n")[1].split("\n")[0];
  const firsts = new Set(["a reel about cats", "launch video", "explain recursion", "recipe", "showreel"].map((p) => first(guide(seedOf(p)))));
  assert.ok(firsts.size >= 3, [...firsts].join(" | "));
});
