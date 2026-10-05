import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { guide, SCENES_GUIDE } from "./guide.ts";
import { check, formatProblems } from "./validate.ts";
import { writeProject } from "./compile.ts";
import { lint, render, settleTimes, snapshot } from "./hyperframes.ts";

// The spec is accepted loosely on purpose: our own validator returns
// fix-it messages a weak model can act on, which a JSON-schema rejection
// from the transport would not.
const specArg = z.record(z.string(), z.unknown()).describe(`A deepseek-motion spec. Call motion_guide first for palettes, type pairs and energies.\n${SCENES_GUIDE}`);
const outArg = z.string().optional().describe("Project folder. Defaults to ./out/<title>.");

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ ...text(t), isError: true });

const server = new McpServer({ name: "deepseek-motion", version: "0.1.0" });

server.registerTool("motion_guide", {
  description: "How to write a deepseek-motion spec: formats, palettes, type pairs, energies, scenes and writing rules. Read this before writing a spec.",
}, async () => text(guide()));

server.registerTool("motion_check", {
  description: "Validate a spec without building it. Returns the total duration, or a list of problems with the exact field and how to fix each one.",
  inputSchema: { spec: specArg },
}, async ({ spec }) => {
  const res = check(spec, { requireCode: true });
  if (!res.ok) return fail(`Spec has problems. Fix these and call again:\n${formatProblems(res.problems)}`);
  return text(`ok: ${res.spec.beats.length} beats, ${res.duration.toFixed(1)}s${res.warnings.length ? `\nwarnings:\n${formatProblems(res.warnings)}` : ""}`);
});

function prepare(spec: unknown, out?: string, music = "none") {
  const res = check(spec, { requireCode: true });
  if (!res.ok) return { error: `Spec has problems. Fix these and call again:\n${formatProblems(res.problems)}` } as const;
  const dir = resolve(out ?? join("out", slug(res.spec.title)));
  mkdirSync(dir, { recursive: true });
  return { spec: res.spec, dir, compiled: writeProject(res.spec, dir, { music }), warnings: res.warnings } as const;
}

server.registerTool("motion_preview", {
  description: "Build the spec and return one frame per beat, captured after each beat's entrance settles, as a single contact sheet image. Use it to review layout and copy before rendering.",
  inputSchema: { spec: specArg, out: outArg },
}, async ({ spec, out }) => {
  const p = prepare(spec, out);
  if ("error" in p) return fail(p.error!);
  const l = await lint(p.dir);
  if (!l.ok) return fail(`HyperFrames check failed (a deepseek-motion bug, not your spec):\n${l.output.slice(-2000)}`);
  const s = await snapshot(p.dir, settleTimes(p.spec, p.compiled));
  if (!s.ok) return fail(`Snapshot failed:\n${s.output.slice(-2000)}`);
  const sheet = join(p.dir, "snapshots", "sheet.jpg");
  const cols = p.spec.format === "16:9" ? 3 : Math.min(5, s.files.length);
  const rows = Math.ceil(s.files.length / cols);
  try {
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-pattern_type", "glob", "-i", join(p.dir, "snapshots", "frame-*.png"),
      "-vf", `scale=${p.spec.format === "16:9" ? 640 : 360}:-1,tile=${cols}x${rows}:padding=6:color=gray`, "-frames:v", "1", "-q:v", "4", sheet]);
  } catch {
    return text(`Built ${p.dir}. Frames (ffmpeg unavailable for a contact sheet):\n${s.files.join("\n")}`);
  }
  const summary = p.compiled.beats.map((b, i) => `${i + 1}. ${b.scene} @ ${b.start}s for ${b.duration}s`).join("\n");
  return {
    content: [
      { type: "text" as const, text: `Built ${p.dir} (${p.compiled.duration}s). Frames left to right, top to bottom:\n${summary}${p.warnings.length ? `\nwarnings:\n${formatProblems(p.warnings)}` : ""}` },
      { type: "image" as const, data: readFileSync(sheet).toString("base64"), mimeType: "image/jpeg" },
    ],
  };
});

server.registerTool("motion_render", {
  description: "Build the spec and render it to MP4 on this machine. Takes about as long as the video, or longer on slow machines.",
  inputSchema: {
    spec: specArg,
    out: outArg,
    quality: z.enum(["draft", "looks", "delivery"]).optional().describe("draft is fastest; looks is the default; delivery is highest quality."),
    music: z.string().optional().describe('"auto" (default) scores the video with the built-in synth, "none" is silent, or a path to an audio file.'),
  },
}, async ({ spec, out, quality, music }) => {
  const p = prepare(spec, out, music ?? "auto");
  if ("error" in p) return fail(p.error!);
  const file = join(p.dir, "final.mp4");
  const r = await render(p.dir, file, quality ?? "looks");
  if (!r.ok) return fail(`Render failed:\n${r.output.slice(-2000)}`);
  return text(`Rendered ${file} (${p.compiled.duration}s, ${p.spec.format}). The HyperFrames project is in ${p.dir} if you want to edit it by hand.`);
});

await server.connect(new StdioServerTransport());
