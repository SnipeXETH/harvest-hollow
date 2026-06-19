import type { CropDef } from "../types";

/**
 * The crop curve. Longer grow time -> bigger payout & XP. Unlocks are spread
 * across levels so there's always a next crop to chase.
 */
export const CROPS: CropDef[] = [
  { id: "carrot", name: "Carrot", emoji: "🥕", unlockLevel: 1, seedCost: 10, sellPrice: 18, xp: 2, growSeconds: 30, color: 0xf6883b },
  { id: "potato", name: "Potato", emoji: "🥔", unlockLevel: 1, seedCost: 16, sellPrice: 32, xp: 3, growSeconds: 90, color: 0xc8973f },
  { id: "wheat", name: "Wheat", emoji: "🌾", unlockLevel: 1, seedCost: 24, sellPrice: 46, xp: 5, growSeconds: 150, color: 0xe8c34a },
  { id: "strawberry", name: "Strawberry", emoji: "🍓", unlockLevel: 2, seedCost: 40, sellPrice: 92, xp: 9, growSeconds: 300, color: 0xe5484d },
  { id: "corn", name: "Corn", emoji: "🌽", unlockLevel: 2, seedCost: 55, sellPrice: 120, xp: 11, growSeconds: 420, color: 0xf2d33b },
  { id: "tomato", name: "Tomato", emoji: "🍅", unlockLevel: 3, seedCost: 85, sellPrice: 200, xp: 18, growSeconds: 900, color: 0xe53e3e },
  { id: "melon", name: "Melon", emoji: "🍈", unlockLevel: 4, seedCost: 130, sellPrice: 320, xp: 28, growSeconds: 1800, color: 0x8bc34a },
  { id: "pumpkin", name: "Pumpkin", emoji: "🎃", unlockLevel: 5, seedCost: 180, sellPrice: 470, xp: 42, growSeconds: 3600, color: 0xed8936 },
  { id: "grapes", name: "Grapes", emoji: "🍇", unlockLevel: 6, seedCost: 260, sellPrice: 660, xp: 60, growSeconds: 5400, color: 0x8e5bd0 },
];

export const CROP_BY_ID: Record<string, CropDef> = Object.fromEntries(CROPS.map((c) => [c.id, c]));
