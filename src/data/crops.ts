import type { CropDef } from "../types";

/**
 * The starter crop curve. Longer grow time -> bigger payout and more XP.
 * Tuned so early crops loop fast (seconds) and later ones use the
 * "come back later" real-clock hook (minutes -> an hour).
 */
export const CROPS: CropDef[] = [
  {
    id: "carrot",
    name: "Carrot",
    emoji: "🥕",
    unlockLevel: 1,
    seedCost: 10,
    sellPrice: 18,
    xp: 2,
    growSeconds: 30,
    color: 0xf6883b,
  },
  {
    id: "wheat",
    name: "Wheat",
    emoji: "🌾",
    unlockLevel: 1,
    seedCost: 20,
    sellPrice: 38,
    xp: 4,
    growSeconds: 120,
    color: 0xe8c34a,
  },
  {
    id: "corn",
    name: "Corn",
    emoji: "🌽",
    unlockLevel: 2,
    seedCost: 45,
    sellPrice: 95,
    xp: 9,
    growSeconds: 300,
    color: 0xf2d33b,
  },
  {
    id: "tomato",
    name: "Tomato",
    emoji: "🍅",
    unlockLevel: 3,
    seedCost: 80,
    sellPrice: 180,
    xp: 18,
    growSeconds: 900,
    color: 0xe53e3e,
  },
  {
    id: "pumpkin",
    name: "Pumpkin",
    emoji: "🎃",
    unlockLevel: 5,
    seedCost: 160,
    sellPrice: 420,
    xp: 40,
    growSeconds: 3600,
    color: 0xed8936,
  },
];

export const CROP_BY_ID: Record<string, CropDef> = Object.fromEntries(
  CROPS.map((c) => [c.id, c])
);
