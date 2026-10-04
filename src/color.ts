// WCAG contrast math, so palettes can be checked rather than trusted.

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const [p, q] = [rgb(a), rgb(b)];
  return "#" + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// The accent, pulled toward the ink just enough to read at small sizes.
// Targets 5:1, not 4.5, so background texture never tips it under.
export function readable(fg: string, toward: string, bg: string, min = 5): string {
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(fg, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}
