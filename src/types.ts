export interface CropDef {
  /** stable id used in save data */
  id: string;
  name: string;
  emoji: string;
  /** player level required to unlock the seed in the shop */
  unlockLevel: number;
  /** coins to buy one seed */
  seedCost: number;
  /** coins earned per harvested tile */
  sellPrice: number;
  /** xp earned per harvested tile */
  xp: number;
  /** real-world grow time in seconds */
  growSeconds: number;
  /** primary colour used for the generated crop art */
  color: number;
}

/** A single planted tile's persisted state. */
export interface PlotState {
  cropId: string;
  /** epoch ms when the crop was planted */
  plantedAt: number;
}

export interface SaveData {
  version: number;
  coins: number;
  gems: number;
  xp: number;
  /** grid side length (gridSize x gridSize tiles unlocked) */
  gridSize: number;
  /** tiles hoed into soil, keyed by "col,row". A planted tile is also tilled. */
  tilled: Record<string, true>;
  /** planted crops keyed by "col,row" (implies the tile is tilled) */
  plots: Record<string, PlotState>;
  /** decoration ids placed, keyed by "col,row" */
  decorations: Record<string, string>;
  lastSeen: number;
}
