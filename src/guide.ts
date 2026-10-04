import { BACKGROUNDS } from "./spec.ts";
import { ENERGIES, FORMATS, PALETTES, TYPE_PAIRS } from "./tokens.ts";

// The whole contract a model needs, kept short enough for a small context
// and concrete enough that a weak model copies the shape instead of guessing.

const table = (o: Record<string, { description: string }>) =>
  Object.entries(o).map(([k, v]) => `  - ${k}: ${v.description}`).join("\n");

export const SCENES_GUIDE = `Scenes (each beat is one scene; every field limit is enforced):
  - title: { text (2-7 words), kicker? (1-4 words) } — opening headline
  - statement: { text (up to 16 words), highlight? (words copied exactly from text) } — one punchy sentence
  - stat: { value (number), prefix? ("$"), suffix? ("%", "x", "K", "M"), decimals? (0-2), label (up to 10 words) } — one big number that counts up
  - list: { title? (up to 6 words), items (2-5 strings, each up to 6 words) }
  - quote: { text (up to 24 words, no quote marks), author? }
  - compare: { title?, left: { label, value? }, right: { label, value? }, winner? ("left"|"right") } — A vs B
  - bars: { title?, unit? ("%"), bars: [{ label (up to 3 words), value (number) }] (2-6 bars) } — bar chart
  - code: { title? (filename or "terminal"), lines (1-8 lines, each up to 46 chars) }
  - end: { text (1-6 words), cta? (up to 6 words, e.g. a URL or @handle) } — closing card
Any beat may set "hold" (seconds) but you should omit it: timing is computed from reading time.`;

export function guide(): string {
  return `You write a JSON spec for a short motion-graphics video. You do not write code, colors, fonts or timings: pick names from the lists below and the renderer handles the design.

Spec shape:
{
  "title": string,
  "format": ${Object.keys(FORMATS).map((f) => `"${f}"`).join(" | ")}   (16:9 YouTube, 9:16 Reels/Shorts/TikTok, 1:1 and 4:5 feed),
  "palette": one of the palettes,
  "type": one of the type pairs,
  "energy": one of the energies,
  "background": ${BACKGROUNDS.map((b) => `"${b}"`).join(" | ")},
  "beats": [ 3-9 beats ]
}

Palettes:
${table(PALETTES)}

Type pairs:
${table(TYPE_PAIRS)}

Energies:
${table(ENERGIES)}

${SCENES_GUIDE}

Writing rules:
  - One idea per beat. Short words beat long ones. On-screen text is not narration.
  - Open with a title or a striking stat; close with an end card.
  - Vary scene types; never two of the same scene in a row.
  - Only use numbers the user gave you or that are common knowledge. Never invent statistics; if you have none, skip stat and bars.
  - Match palette, type and energy to the topic's mood.

Example:
{"title":"Why sleep matters","format":"9:16","palette":"electric-blue","type":"clean","energy":"smooth","background":"dots","beats":[
 {"scene":"title","kicker":"Health","text":"Sleep is a superpower"},
 {"scene":"stat","value":7,"suffix":"+","label":"hours a night most adults need"},
 {"scene":"list","title":"What it fixes","items":["Memory","Mood","Focus"]},
 {"scene":"statement","text":"Your brain cleans itself while you sleep.","highlight":"cleans itself"},
 {"scene":"end","text":"Go to bed","cta":"@sleepwell"}]}

Reply with the JSON object only.`;
}
