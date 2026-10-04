# deepseek-motion

**Beautiful motion graphics from DeepSeek, or any other cheap model.**

Cheap models write code fine. They have terrible taste. Ask one for a motion graphic and you get
default easing, cramped type, random colors and text that flashes by too fast to read.

deepseek-motion moves the taste out of the model and into the tool. The model writes a tiny JSON spec
(scenes, words, and a few names picked from a menu) and deepseek-motion turns it into a
[HyperFrames](https://github.com/heygen-com/hyperframes) composition that renders to MP4 on your machine.
Palettes, type pairs, easing curves, type scale, safe zones and how long each line stays on screen are all
curated presets. The model never touches a pixel, a millisecond or a hex code.

```json
{
  "title": "RAG in 20 seconds",
  "format": "9:16",
  "palette": "midnight-lime",
  "type": "grotesk",
  "energy": "bouncy",
  "background": "dots",
  "beats": [
    { "scene": "title", "kicker": "AI Basics", "text": "RAG, explained fast" },
    { "scene": "statement", "text": "LLMs forget stuff. RAG hands them a library card.", "highlight": "library card" },
    { "scene": "list", "title": "How it works", "items": ["Search your own docs", "Grab the best bits", "Answer with sources"] },
    { "scene": "compare", "left": { "label": "Plain LLM", "value": "Guesses" }, "right": { "label": "RAG", "value": "Cites sources" }, "winner": "right" },
    { "scene": "end", "text": "Go build one", "cta": "Try it in Colab" }
  ]
}
```

That spec was written by DeepSeek V4.1 Flash on its first try, in 4.4 seconds, for about 1,900 tokens.

## Quick start

Needs Node 22.18+ and ffmpeg.

```bash
npm install
export DEEPSEEK_API_KEY=sk-...
node src/cli.ts make "a 20 second reel explaining RAG for CS students, playful" --format 9:16
```

You get `out/<title>/` with `spec.json`, `index.html` (the HyperFrames project), one preview PNG per beat in
`snapshots/`, and `final.mp4`.

## Other models

Built and tuned for DeepSeek, but `make` talks to any OpenAI-compatible endpoint:

```bash
# OpenRouter, Together, Groq, ...
DEEPSEEK_MOTION_BASE_URL=https://openrouter.ai/api/v1 DEEPSEEK_MOTION_API_KEY=... DEEPSEEK_MOTION_MODEL=qwen/qwen3-coder \
  node src/cli.ts make "..."

# Local, through Ollama
DEEPSEEK_MOTION_BASE_URL=http://localhost:11434/v1 DEEPSEEK_MOTION_MODEL=qwen3:14b node src/cli.ts make "..."
```

If the spec breaks a rule, the model gets back a list of problems that names the exact field and the fix
(`beats[2].items[1]: "..." is 9 words; the limit is 6. Cut it to the key phrase.`) and tries again, up to three times.

## In an agent (MCP)

```bash
claude mcp add deepseek-motion -- node /path/to/deepseek-motion/src/cli.ts mcp
```

| Tool | What it does |
| --- | --- |
| `motion_guide` | The whole spec contract: palettes, type pairs, energies, scenes, writing rules |
| `motion_check` | Validate a spec; returns fix-it messages |
| `motion_preview` | Build and return one frame per beat as a contact sheet image |
| `motion_render` | Render to MP4 |

## What's in the box

**Scenes:** `title`, `statement` (with a highlighter sweep), `stat` (counts up), `list`, `quote`, `compare`,
`bars`, `code` (types itself out), `flow` (stages joined by arrows, with data travelling through), `steps`
(a tracker that ticks off each step), `end`.

**Formats:** 16:9, 9:16, 1:1, 4:5, each with its own safe zones. Vertical formats keep clear of the
Reels/TikTok UI and use bigger small text for phones.

**Palettes:** midnight-lime, paper-ink, electric-blue, sunset-ember, mono-noir, ultraviolet, graphite-orange,
arctic, mint-cream. Every one is contrast-tested, and small accent text is automatically shifted until it reads
at 5:1. The model sees them in a different order for every prompt, because cheap models tend to take the first
option offered.

**Type pairs:** grotesk (Space Grotesk + Inter), editorial (Instrument Serif italic + Inter), mono-tech
(JetBrains Mono), clean (Inter). Fonts ship with the project, so renders never depend on the network.

**Energies:** calm, smooth, snappy, bouncy. Each sets the easing, entrance length, stagger and travel distance.

**Timing:** each beat lasts as long as its choreography plus the time it takes to read its words at
3 words per second. If the user asks for a length, the model sets `duration` and the holds flex to hit it
exactly. If the beats can't fit, or can't fill it, the model is told how many beats to remove or add.

**Transitions:** snappy and bouncy videos cut between beats with an accent-colored wipe; calm and smooth ones fade.

## Commands

```
deepseek-motion make "<prompt>"   ask a model for a spec, then build it
deepseek-motion check <spec.json> validate a spec
deepseek-motion build <spec.json> write the HyperFrames project
deepseek-motion preview <spec>    build + one PNG per beat
deepseek-motion render <spec>     build + render final.mp4
deepseek-motion guide             print the spec guide models are given
deepseek-motion mcp               run the MCP server on stdio
```

## Development

```bash
npm test                 # unit tests
node scripts/matrix.ts   # every scene at its copy limits, in every format and type pair, through HyperFrames' layout + contrast audit
npm run build            # compile to dist/
```

Status: 0.1, early. MIT. An independent project, not affiliated with DeepSeek.
