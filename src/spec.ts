import { z } from "zod";
import { ENERGIES, FORMATS, PALETTES, TYPE_PAIRS, type FormatName } from "./tokens.ts";

const names = (o: object) => Object.keys(o) as [string, ...string[]];

const hold = z.number().min(0.5).max(9).optional()
  .describe("Seconds to hold after the entrance. Omit it: hold is computed from reading time.");

export const TitleBeat = z.object({
  scene: z.literal("title"),
  text: z.string().min(1).describe("The headline. 2-7 words."),
  kicker: z.string().optional().describe("Small label above the headline. 1-4 words."),
  hold,
});

export const StatementBeat = z.object({
  scene: z.literal("statement"),
  text: z.string().min(1).describe("One sentence. Up to 16 words."),
  highlight: z.string().optional().describe("A word or short phrase copied exactly from text, marked with the accent."),
  hold,
});

export const StatBeat = z.object({
  scene: z.literal("stat"),
  value: z.number().describe("The number to count up to."),
  prefix: z.string().max(3).optional().describe("e.g. $"),
  suffix: z.string().max(4).optional().describe("e.g. %, x, K, +"),
  decimals: z.number().int().min(0).max(2).optional(),
  label: z.string().min(1).describe("What the number means. Up to 10 words."),
  hold,
});

export const ListBeat = z.object({
  scene: z.literal("list"),
  title: z.string().optional().describe("Up to 6 words."),
  items: z.array(z.string().min(1)).min(2).max(5).describe("2-5 items, each up to 6 words."),
  hold,
});

export const QuoteBeat = z.object({
  scene: z.literal("quote"),
  text: z.string().min(1).describe("The quote, without quotation marks. Up to 24 words."),
  author: z.string().optional(),
  hold,
});

const Side = z.object({
  label: z.string().min(1).describe("Up to 4 words."),
  value: z.string().optional().describe("Short value, e.g. '$0.02' or '12 min'."),
});

export const CompareBeat = z.object({
  scene: z.literal("compare"),
  title: z.string().optional().describe("Up to 6 words."),
  left: Side,
  right: Side,
  winner: z.enum(["left", "right"]).optional().describe("Side to highlight with the accent."),
  hold,
});

export const BarsBeat = z.object({
  scene: z.literal("bars"),
  title: z.string().optional().describe("Up to 6 words."),
  unit: z.string().max(4).optional().describe("Appended to each value, e.g. %"),
  bars: z.array(z.object({
    label: z.string().min(1).describe("Up to 3 words."),
    value: z.number().min(0),
  })).min(2).max(6),
  hold,
});

export const CodeBeat = z.object({
  scene: z.literal("code"),
  title: z.string().optional().describe("Window title, e.g. a filename or 'terminal'."),
  lines: z.array(z.string()).min(1).max(8).describe("1-8 lines of code, each up to 46 characters."),
  hold,
});

export const EndBeat = z.object({
  scene: z.literal("end"),
  text: z.string().min(1).describe("Closing line or brand name. 1-6 words."),
  cta: z.string().optional().describe("Call to action, e.g. a URL or '@handle'. Up to 6 words."),
  hold,
});

export const FlowBeat = z.object({
  scene: z.literal("flow"),
  title: z.string().optional().describe("Up to 6 words."),
  nodes: z.array(z.string().min(1)).min(2).max(5).describe("2-5 stages, each up to 3 words. Data visibly travels from one to the next."),
  caption: z.string().optional().describe("One line under the diagram. Up to 12 words."),
  hold,
});

export const StepsBeat = z.object({
  scene: z.literal("steps"),
  title: z.string().optional().describe("Up to 6 words."),
  steps: z.array(z.string().min(1)).min(2).max(6).describe("2-6 steps in order, each up to 5 words. They tick off one by one."),
  hold,
});

export const CustomBeat = z.object({
  scene: z.literal("custom"),
  brief: z.string().min(1).describe("What this animated moment shows, concretely: subject, motion, the one line of text if any. Up to 50 words."),
  seconds: z.number().min(2).max(12).default(5).describe("Length of the moment."),
  code: z.string().optional().describe("Body of draw(ctx, t, api). Written in a second step from the brief; see the custom scene API."),
});

export const Beat = z.discriminatedUnion("scene", [
  TitleBeat, StatementBeat, StatBeat, ListBeat, QuoteBeat, CompareBeat, BarsBeat, CodeBeat, FlowBeat, StepsBeat, CustomBeat, EndBeat,
]);
export type Beat = z.infer<typeof Beat>;
export type SceneName = Beat["scene"];

export const BACKGROUNDS = ["glow", "grid", "dots", "plain"] as const;

export const Spec = z.object({
  title: z.string().min(1).describe("Working title; names the output folder."),
  format: z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]).default("16:9"),
  palette: z.enum(names(PALETTES)).default("midnight-lime"),
  type: z.enum(names(TYPE_PAIRS)).default("grotesk"),
  energy: z.enum(names(ENERGIES)).default("smooth"),
  background: z.enum(BACKGROUNDS).default("glow"),
  duration: z.number().min(5).max(180).optional().describe("Target length in seconds. Set it only when the user asks for a length."),
  beats: z.array(Beat).min(1).max(12),
});
export type Spec = z.infer<typeof Spec>;
export type SpecInput = z.input<typeof Spec>;
