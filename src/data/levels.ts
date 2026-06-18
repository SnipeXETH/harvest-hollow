/**
 * XP needed to reach each level. Index 0 is unused (level starts at 1).
 * Smooth ramp: each level costs a bit more than the last.
 */
function buildCurve(maxLevel: number): number[] {
  const curve = [0, 0]; // level 0 (unused) and level 1 (0 xp)
  let total = 0;
  for (let lvl = 2; lvl <= maxLevel; lvl++) {
    const cost = Math.round(20 * Math.pow(lvl - 1, 1.55));
    total += cost;
    curve[lvl] = total;
  }
  return curve;
}

export const XP_CURVE = buildCurve(50);

/** Highest level whose cumulative XP requirement is met. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (let lvl = 2; lvl < XP_CURVE.length; lvl++) {
    if (xp >= XP_CURVE[lvl]) level = lvl;
    else break;
  }
  return level;
}

/** XP progress within the current level: { into, needed, ratio }. */
export function levelProgress(xp: number): {
  level: number;
  into: number;
  needed: number;
  ratio: number;
} {
  const level = levelForXp(xp);
  const base = XP_CURVE[level] ?? 0;
  const next = XP_CURVE[level + 1];
  if (next === undefined) {
    return { level, into: 0, needed: 0, ratio: 1 };
  }
  const into = xp - base;
  const needed = next - base;
  return { level, into, needed, ratio: Math.min(1, into / needed) };
}
