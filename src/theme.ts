/** Shared visual language so every scene looks like one game. */

export const FONT = 'Fredoka, "Segoe UI", system-ui, sans-serif';

export const COLORS = {
  // Surfaces
  cream: 0xfffdf6,
  creamStr: "#fffdf6",
  rowBg: 0xf5eede,
  rowBgLocked: 0xeae3d4,

  // Ink / text
  ink: "#4a3826",
  inkSoft: "#9c8a6e",

  // Brand actions
  green: 0x62b73d,
  greenDark: 0x4c9a2d,
  gold: 0xffc23d,
  goldDark: 0xe2a01c,

  // Accents
  blue: 0x36a7e0,
  lock: 0xc8bca4,

  // Misc
  xpTrack: 0xe7ddc8,
  shadow: 0x3a2c1a,
  white: "#ffffff",

  // Sky backdrop gradient
  skyTop: 0xd4eefb,
  skyBottom: 0xbfe6ad,
};

/** "62b73d" -> "#62b73d" for use in Text color styles. */
export function hex(n: number): string {
  return "#" + n.toString(16).padStart(6, "0");
}
