import { BACKGROUNDS } from "./spec.ts";
import { ENERGIES, FORMATS, PALETTES, TYPE_PAIRS } from "./tokens.ts";

// The whole contract a model needs, kept short enough for a small context
// and concrete enough that a weak model copies the shape instead of guessing.

// Options are listed in a different order per request: weak models tend
// to take the first option offered, which made every video look alike.
const table = (o: Record<string, { description: string }>, seed: number) =>
  shuffle(Object.entries(o), seed).map(([k, v]) => `  - ${k}: ${v.description}`).join("\n");

function shuffle<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const seedOf = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0;

export const SCENES_GUIDE = `Scenes (each beat is one scene; every field limit is enforced):
  - title: { text (2-7 words), kicker? (1-4 words) } — opening headline
  - statement: { text (up to 16 words), highlight? (words copied exactly from text) } — one punchy sentence
  - stat: { value (number), prefix? ("$"), suffix? ("%", "x", "K", "M"), decimals? (0-2), label (up to 10 words) } — one big number that counts up
  - list: { title? (up to 6 words), items (2-5 strings, each up to 6 words) }
  - quote: { text (up to 24 words, no quote marks), author? }
  - compare: { title?, left: { label, value? }, right: { label, value? }, winner? ("left"|"right") } — A vs B
  - bars: { title?, unit? ("%"), bars: [{ label (up to 3 words), value (number) }] (2-6 bars) } — bar chart
  - code: { title? (filename or "terminal"), lines (1-8 lines, each up to 46 chars) }
  - flow: { title?, nodes (2-5 stages, each up to 3 words), caption? (up to 12 words) } — boxes joined by arrows with data travelling through; for pipelines, systems, cause and effect
  - steps: { title?, steps (2-6 steps in order, each up to 5 words) } — a tracker that ticks off each step; for recipes, how-tos, processes
  - custom: { brief (up to 50 words), seconds (2-12, default 5) } — a free-form animated moment drawn in code in a second step. Anything the other scenes can't show: a simulation, a visual metaphor, particles, abstract motion, giant kinetic type, an illustration that builds itself
  - end: { text (1-6 words), cta? (up to 6 words, e.g. a URL or @handle) } — closing card
Any beat may set "hold" (seconds) but you should omit it: timing is computed from reading time.`;

export function guide(seed = 0): string {
  return `You write a JSON spec for a short motion-graphics video. You do not write code, colors, fonts or timings: pick names from the lists below and the renderer handles the design.

Spec shape:
{
  "title": string,
  "format": ${Object.keys(FORMATS).map((f) => `"${f}"`).join(" | ")}   (16:9 YouTube, 9:16 Reels/Shorts/TikTok, 1:1 and 4:5 feed),
  "palette": one of the palettes,
  "type": one of the type pairs,
  "energy": one of the energies,
  "background": ${BACKGROUNDS.map((b) => `"${b}"`).join(" | ")},
  "duration": seconds (optional; only when the user asks for a length),
  "beats": [ 3-9 beats ]
}

Palettes:
${table(PALETTES, seed)}

Type pairs:
${table(TYPE_PAIRS, seed + 1)}

Energies:
${table(ENERGIES, seed + 2)}

${SCENES_GUIDE}

Custom moments are where a video gets its "wow". The other scenes are clean but plain.
  - Use 2-4 custom beats in every video, placed at the opening hook, the key idea, and the climax. Use preset scenes between them for facts, lists and the end card.
  - For showreels, brand films and abstract prompts, make most beats custom.
  - Write each brief like a storyboard line: what we see, how it moves, how it builds to its peak, and the one short line of text (if any) and where it lands. Concrete beats vague: "70 glowing dots stream left to right into a tall gate; every third passes and turns orange, the rest bounce off and fall; headline 'Only 1 in 3 gets through' slams in at the top" beats "show rate limiting".

Writing rules:
  - One idea per beat. Short words beat long ones. On-screen text is not narration.
  - Open with a title or a striking stat; close with an end card.
  - Vary scene types; never two of the same scene in a row.
  - Only use numbers the user gave you or that are common knowledge. Never invent statistics; if you have none, skip stat and bars.
  - Show, don't tell: when the idea is a process use steps, a system or pipeline use flow, numbers use stat or bars, a trade-off use compare. Use statement only for the one line that matters.
  - Pick palette, type and energy for the topic's mood. Do not default to the first option listed.
  - If the user asks for a length ("15-second", "1 minute"), set duration to it and use fewer beats: about one beat per 3-4 seconds.

Example:
{"title":"Why sleep matters","format":"9:16","palette":"electric-blue","type":"clean","energy":"smooth","background":"dots","beats":[
 {"scene":"custom","seconds":5,"brief":"A dark night sky; hundreds of tiny stars drift and slowly gather into a giant crescent moon that fills the frame, glowing accent at its edge. 'Sleep is a superpower' rises word by word underneath, huge."},
 {"scene":"stat","value":7,"suffix":"+","label":"hours a night most adults need"},
 {"scene":"flow","title":"While you sleep","nodes":["Day's memories","Deep sleep","Long-term store"]},
 {"scene":"custom","seconds":6,"brief":"A brain outline drawn in thin ink lines; glowing accent particles (memories) flow in from the left, swirl through it, and settle into neat rows on the right like filed cards. Small caption 'filed overnight' fades in."},
 {"scene":"statement","text":"Your brain cleans itself while you sleep.","highlight":"cleans itself"},
 {"scene":"end","text":"Go to bed","cta":"@sleepwell"}]}

Reply with the JSON object only.`;
}
