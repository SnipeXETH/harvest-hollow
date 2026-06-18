import Phaser from "phaser";
import { CONFIG } from "../config";
import type { SaveData, PlotState } from "../types";
import { CROP_BY_ID } from "../data/crops";
import { levelForXp } from "../data/levels";

type Events = "wallet" | "xp" | "levelup" | "land" | "owned" | "timescale";

const CS = CONFIG.chunkSize;

/** Single source of truth for the player's farm + persistence. */
class GameStateImpl extends Phaser.Events.EventEmitter {
  data!: SaveData;
  timeScale = CONFIG.defaultTimeScale;

  load(): void {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SaveData;
        if (parsed.version === CONFIG.saveVersion) {
          parsed.owned ??= {};
          parsed.tilled ??= {};
          parsed.plots ??= {};
          parsed.decorations ??= {};
          parsed.farmer ??= { col: CS / 2, row: CS / 2 };
          this.data = parsed;
          return;
        }
      } catch {
        /* fall through */
      }
    }
    this.data = this.freshSave();
    this.save();
  }

  private freshSave(): SaveData {
    const owned: Record<string, true> = {};
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const [cx, cy] of CONFIG.startChunks) {
      owned[`${cx},${cy}`] = true;
      minC = Math.min(minC, cx * CS);
      maxC = Math.max(maxC, cx * CS + CS - 1);
      minR = Math.min(minR, cy * CS);
      maxR = Math.max(maxR, cy * CS + CS - 1);
    }
    return {
      version: CONFIG.saveVersion,
      coins: CONFIG.startCoins,
      gems: CONFIG.startGems,
      xp: 0,
      owned,
      tilled: {},
      plots: {},
      decorations: {},
      farmer: { col: (minC + maxC) / 2, row: (minR + maxR) / 2 },
      lastSeen: Date.now(),
    };
  }

  save(): void {
    this.data.lastSeen = Date.now();
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(this.data));
  }

  reset(): void {
    this.data = this.freshSave();
    this.save();
    this.emit("wallet");
    this.emit("xp");
    this.emit("land");
    this.emit("owned");
  }

  // --- Wallet ---------------------------------------------------------
  get coins() {
    return this.data.coins;
  }
  get gems() {
    return this.data.gems;
  }
  get level() {
    return levelForXp(this.data.xp);
  }
  get xp() {
    return this.data.xp;
  }
  canAfford(n: number) {
    return this.data.coins >= n;
  }
  addCoins(n: number) {
    this.data.coins += n;
    this.emit("wallet");
    this.save();
  }
  spendCoins(n: number) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.emit("wallet");
    this.save();
    return true;
  }
  addGems(n: number) {
    this.data.gems += n;
    this.emit("wallet");
    this.save();
  }
  addXp(n: number) {
    const before = this.level;
    this.data.xp += n;
    const after = this.level;
    this.emit("xp");
    if (after > before) this.emit("levelup", after);
    this.save();
  }

  // --- Keys / chunks --------------------------------------------------
  key(col: number, row: number) {
    return `${col},${row}`;
  }
  chunkKey(cx: number, cy: number) {
    return `${cx},${cy}`;
  }
  chunkOf(col: number, row: number) {
    return { cx: Math.floor(col / CS), cy: Math.floor(row / CS) };
  }
  isChunkOwned(cx: number, cy: number) {
    return !!this.data.owned[this.chunkKey(cx, cy)];
  }
  isOwnedTile(col: number, row: number) {
    const { cx, cy } = this.chunkOf(col, row);
    return this.isChunkOwned(cx, cy);
  }
  ownedChunkCount() {
    return Object.keys(this.data.owned).length;
  }

  /** Chunks orthogonally adjacent to an owned chunk, not yet owned, in-world. */
  buyableChunks(): { cx: number; cy: number }[] {
    const R = CONFIG.worldRadiusChunks;
    const seen = new Set<string>();
    const out: { cx: number; cy: number }[] = [];
    for (const key of Object.keys(this.data.owned)) {
      const [cx, cy] = key.split(",").map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (Math.abs(nx) > R || Math.abs(ny) > R) continue;
        const k = this.chunkKey(nx, ny);
        if (this.data.owned[k] || seen.has(k)) continue;
        seen.add(k);
        out.push({ cx: nx, cy: ny });
      }
    }
    return out;
  }

  plotCost() {
    // Cost scales with how many plots you've BOUGHT beyond the starting land.
    const bought = Math.max(0, this.ownedChunkCount() - CONFIG.startChunks.length);
    const raw = CONFIG.plotBaseCost * Math.pow(CONFIG.plotCostGrowth, bought);
    return Math.round(raw / 10) * 10;
  }

  buyChunk(cx: number, cy: number): boolean {
    if (this.isChunkOwned(cx, cy)) return false;
    if (!this.buyableChunks().some((c) => c.cx === cx && c.cy === cy)) return false;
    if (!this.spendCoins(this.plotCost())) return false;
    this.data.owned[this.chunkKey(cx, cy)] = true;
    this.emit("owned");
    this.save();
    return true;
  }

  /** Tile bounds spanning owned + buyable chunks (in tile coords). */
  activeBounds() {
    let minC = Infinity,
      maxC = -Infinity,
      minR = Infinity,
      maxR = -Infinity;
    const consider = (cx: number, cy: number) => {
      minC = Math.min(minC, cx * CS);
      maxC = Math.max(maxC, cx * CS + CS - 1);
      minR = Math.min(minR, cy * CS);
      maxR = Math.max(maxR, cy * CS + CS - 1);
    };
    for (const key of Object.keys(this.data.owned)) {
      const [cx, cy] = key.split(",").map(Number);
      consider(cx, cy);
    }
    for (const { cx, cy } of this.buyableChunks()) consider(cx, cy);
    return { minC, maxC, minR, maxR };
  }

  // --- Tiles ----------------------------------------------------------
  getPlot(col: number, row: number): PlotState | undefined {
    return this.data.plots[this.key(col, row)];
  }
  isTilled(col: number, row: number) {
    return !!this.data.tilled[this.key(col, row)];
  }
  tileState(col: number, row: number): "grass" | "soil" | "planted" {
    const k = this.key(col, row);
    if (this.data.plots[k]) return "planted";
    if (this.data.tilled[k]) return "soil";
    return "grass";
  }

  till(col: number, row: number): boolean {
    if (!this.isOwnedTile(col, row)) return false;
    if (this.tileState(col, row) !== "grass") return false;
    if (!this.spendCoins(CONFIG.tillCost)) return false;
    this.data.tilled[this.key(col, row)] = true;
    this.emit("land");
    this.save();
    return true;
  }

  plant(col: number, row: number, cropId: string): boolean {
    const crop = CROP_BY_ID[cropId];
    if (!crop) return false;
    if (!this.isOwnedTile(col, row)) return false;
    if (this.tileState(col, row) !== "soil") return false;
    if (!this.spendCoins(crop.seedCost)) return false;
    this.data.plots[this.key(col, row)] = { cropId, plantedAt: Date.now() };
    this.emit("land");
    this.save();
    return true;
  }

  growthRatio(plot: PlotState): number {
    const crop = CROP_BY_ID[plot.cropId];
    if (!crop) return 1;
    const elapsed = ((Date.now() - plot.plantedAt) / 1000) * this.timeScale;
    return Phaser.Math.Clamp(elapsed / crop.growSeconds, 0, 1);
  }
  isReady(plot: PlotState) {
    return this.growthRatio(plot) >= 1;
  }
  secondsLeft(plot: PlotState) {
    const crop = CROP_BY_ID[plot.cropId];
    if (!crop) return 0;
    const elapsed = ((Date.now() - plot.plantedAt) / 1000) * this.timeScale;
    return Math.max(0, Math.ceil(crop.growSeconds - elapsed));
  }

  harvest(col: number, row: number): boolean {
    const plot = this.getPlot(col, row);
    if (!plot || !this.isReady(plot)) return false;
    const crop = CROP_BY_ID[plot.cropId];
    delete this.data.plots[this.key(col, row)];
    this.emit("land");
    if (crop) {
      this.addCoins(crop.sellPrice);
      this.addXp(crop.xp);
    }
    this.save();
    return true;
  }

  // --- Farmer position ------------------------------------------------
  setFarmer(col: number, row: number) {
    this.data.farmer = { col, row };
    // not saved every step (caller saves on settle)
  }

  setTimeScale(scale: number) {
    this.timeScale = scale;
    this.emit("timescale", scale);
  }

  on(event: Events, fn: (...args: any[]) => void, ctx?: any): this {
    return super.on(event, fn, ctx);
  }
  emit(event: Events, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}

export const GameState = new GameStateImpl();
