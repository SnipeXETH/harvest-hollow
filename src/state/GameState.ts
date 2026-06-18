import Phaser from "phaser";
import { CONFIG } from "../config";
import type { SaveData, PlotState } from "../types";
import { CROP_BY_ID } from "../data/crops";
import { levelForXp } from "../data/levels";

type Events =
  | "wallet"
  | "xp"
  | "levelup"
  | "land"
  | "grid"
  | "timescale";

/**
 * Single source of truth for the player's farm. Owns persistence and
 * emits events so the UI and farm scene stay in sync without coupling.
 */
class GameStateImpl extends Phaser.Events.EventEmitter {
  data!: SaveData;
  timeScale = CONFIG.defaultTimeScale;

  load(): void {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SaveData;
        // Only reuse saves from the current model version.
        if (parsed.version === CONFIG.saveVersion) {
          parsed.decorations ??= {};
          parsed.plots ??= {};
          parsed.tilled ??= {};
          this.data = parsed;
          return;
        }
      } catch {
        /* fall through to a fresh save */
      }
    }
    this.data = this.freshSave();
    this.save();
  }

  private freshSave(): SaveData {
    const now = Date.now();
    return {
      version: CONFIG.saveVersion,
      coins: CONFIG.startCoins,
      gems: CONFIG.startGems,
      xp: 0,
      gridSize: CONFIG.startGridSize,
      tilled: {},
      plots: {},
      decorations: {},
      lastSeen: now,
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
    this.emit("grid");
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

  canAfford(coins: number): boolean {
    return this.data.coins >= coins;
  }

  addCoins(n: number): void {
    this.data.coins += n;
    this.emit("wallet");
    this.save();
  }

  spendCoins(n: number): boolean {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.emit("wallet");
    this.save();
    return true;
  }

  addGems(n: number): void {
    this.data.gems += n;
    this.emit("wallet");
    this.save();
  }

  addXp(n: number): void {
    const before = this.level;
    this.data.xp += n;
    const after = this.level;
    this.emit("xp");
    if (after > before) this.emit("levelup", after);
    this.save();
  }

  // --- Tiles & plots --------------------------------------------------
  key(col: number, row: number): string {
    return `${col},${row}`;
  }

  inBounds(col: number, row: number): boolean {
    return (
      col >= 0 &&
      row >= 0 &&
      col < this.data.gridSize &&
      row < this.data.gridSize
    );
  }

  getPlot(col: number, row: number): PlotState | undefined {
    return this.data.plots[this.key(col, row)];
  }

  isTilled(col: number, row: number): boolean {
    return !!this.data.tilled[this.key(col, row)];
  }

  /** Logical state of a tile. */
  tileState(col: number, row: number): "grass" | "soil" | "planted" {
    const k = this.key(col, row);
    if (this.data.plots[k]) return "planted";
    if (this.data.tilled[k]) return "soil";
    return "grass";
  }

  /** Hoe grass into a soil plot. */
  till(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false;
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
    // Can only sow into empty, already-tilled soil.
    if (this.tileState(col, row) !== "soil") return false;
    if (!this.spendCoins(crop.seedCost)) return false;
    this.data.plots[this.key(col, row)] = {
      cropId,
      plantedAt: Date.now(),
    };
    this.emit("land");
    this.save();
    return true;
  }

  /** Growth ratio 0..1, accounting for dev time-scale. */
  growthRatio(plot: PlotState): number {
    const crop = CROP_BY_ID[plot.cropId];
    if (!crop) return 1;
    const elapsed = ((Date.now() - plot.plantedAt) / 1000) * this.timeScale;
    return Phaser.Math.Clamp(elapsed / crop.growSeconds, 0, 1);
  }

  isReady(plot: PlotState): boolean {
    return this.growthRatio(plot) >= 1;
  }

  /** Seconds remaining until ready (dev-scaled), 0 if ready. */
  secondsLeft(plot: PlotState): number {
    const crop = CROP_BY_ID[plot.cropId];
    if (!crop) return 0;
    const elapsed = ((Date.now() - plot.plantedAt) / 1000) * this.timeScale;
    return Math.max(0, Math.ceil(crop.growSeconds - elapsed));
  }

  harvest(col: number, row: number): boolean {
    const plot = this.getPlot(col, row);
    if (!plot || !this.isReady(plot)) return false;
    const crop = CROP_BY_ID[plot.cropId];
    // Remove the crop but keep the tile tilled (it stays a soil plot).
    delete this.data.plots[this.key(col, row)];
    this.emit("land");
    if (crop) {
      this.addCoins(crop.sellPrice);
      this.addXp(crop.xp);
    }
    this.save();
    return true;
  }

  // --- Grid expansion -------------------------------------------------
  get gridSize() {
    return this.data.gridSize;
  }

  expansionCost(): number {
    const step = this.data.gridSize - CONFIG.startGridSize;
    return Math.round(CONFIG.expansionBaseCost * Math.pow(2.2, step));
  }

  canExpand(): boolean {
    return this.data.gridSize < CONFIG.maxGridSize;
  }

  expand(): boolean {
    if (!this.canExpand()) return false;
    if (!this.spendCoins(this.expansionCost())) return false;
    this.data.gridSize += 1;
    this.emit("grid");
    this.save();
    return true;
  }

  // --- Dev ------------------------------------------------------------
  setTimeScale(scale: number): void {
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
