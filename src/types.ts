export interface CropDef {
  id: string;
  name: string;
  emoji: string;
  unlockLevel: number;
  seedCost: number;
  sellPrice: number;
  xp: number;
  growSeconds: number;
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
  /** owned land chunks, keyed by "cx,cy" */
  owned: Record<string, true>;
  /** tiles hoed into soil, keyed by "col,row" (must be on owned land) */
  tilled: Record<string, true>;
  /** planted crops keyed by "col,row" */
  plots: Record<string, PlotState>;
  /** decoration ids placed, keyed by "col,row" */
  decorations: Record<string, string>;
  /** where the farmer is standing (tile coords, may be fractional) */
  farmer: { col: number; row: number };
  lastSeen: number;
}
