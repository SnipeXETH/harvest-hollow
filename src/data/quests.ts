import type { QuestInstance } from "../types";

export type QuestType = "harvest" | "harvestCrop" | "plant" | "till" | "buy" | "earn" | "level";

export interface QuestDef {
  id: string;
  /** {n} is replaced with the target */
  text: string;
  icon: string;
  type: QuestType;
  cropId?: string;
  target: number;
  reward: { coins?: number; gems?: number; xp?: number };
  minLevel?: number;
}

export const QUEST_POOL: QuestDef[] = [
  { id: "harvest12", text: "Harvest {n} crops", icon: "🧺", type: "harvest", target: 12, reward: { coins: 120, xp: 10 } },
  { id: "harvest30", text: "Harvest {n} crops", icon: "🧺", type: "harvest", target: 30, reward: { coins: 320, xp: 24 }, minLevel: 2 },
  { id: "plant15", text: "Plant {n} seeds", icon: "🌱", type: "plant", target: 15, reward: { coins: 110, xp: 9 } },
  { id: "till10", text: "Plough {n} tiles", icon: "🪓", type: "till", target: 10, reward: { coins: 90, xp: 6 } },
  { id: "carrot18", text: "Harvest {n} carrots", icon: "🥕", type: "harvestCrop", cropId: "carrot", target: 18, reward: { coins: 160, xp: 12 } },
  { id: "wheat12", text: "Harvest {n} wheat", icon: "🌾", type: "harvestCrop", cropId: "wheat", target: 12, reward: { coins: 220, xp: 16 }, minLevel: 1 },
  { id: "corn8", text: "Harvest {n} corn", icon: "🌽", type: "harvestCrop", cropId: "corn", target: 8, reward: { coins: 420, xp: 28 }, minLevel: 2 },
  { id: "tomato6", text: "Harvest {n} tomatoes", icon: "🍅", type: "harvestCrop", cropId: "tomato", target: 6, reward: { coins: 600, xp: 36 }, minLevel: 3 },
  { id: "buy1", text: "Buy {n} new plot", icon: "🚜", type: "buy", target: 1, reward: { gems: 1, xp: 10 } },
  { id: "earn600", text: "Earn {n} coins", icon: "🪙", type: "earn", target: 600, reward: { gems: 1, xp: 18 } },
  { id: "level", text: "Reach level {n}", icon: "⭐", type: "level", target: 0, reward: { coins: 260, gems: 1 } },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUEST_POOL.map((q) => [q.id, q]));

/** Pick a fresh quest suitable for the player's level, avoiding the excluded ids. */
export function genQuest(level: number, excludeIds: string[]): QuestInstance {
  const candidates = QUEST_POOL.filter((q) => (q.minLevel ?? 0) <= level && !excludeIds.includes(q.id));
  const pool = candidates.length ? candidates : QUEST_POOL.filter((q) => (q.minLevel ?? 0) <= level);
  const def = pool[Math.floor(Math.random() * pool.length)];
  const target = def.type === "level" ? level + 1 : def.target;
  return { defId: def.id, target, progress: def.type === "level" ? level : 0 };
}

export function questText(inst: QuestInstance): string {
  const def = QUEST_BY_ID[inst.defId];
  return def ? def.text.replace("{n}", `${inst.target}`) : "";
}
