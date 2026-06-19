import Phaser from "phaser";
import { CONFIG } from "../config";
import type { SaveData, PlotState, QuestInstance } from "../types";
import { CROPS, CROP_BY_ID } from "../data/crops";
import { levelForXp } from "../data/levels";
import { genQuest, QUEST_BY_ID } from "../data/quests";
import type { QuestType } from "../data/quests";
import { DECOR_BY_ID } from "../data/decorations";

type Events =
  | "wallet"
  | "xp"
  | "levelup"
  | "land"
  | "owned"
  | "timescale"
  | "quests"
  | "daily"
  | "decor"
  | "combo";

const CS = CONFIG.chunkSize;

/** Single source of truth for the player's farm + persistence. */
class GameStateImpl extends Phaser.Events.EventEmitter {
  data!: SaveData;
  timeScale = CONFIG.defaultTimeScale;

  // Harvest combo (not persisted).
  private comboCount = 0;
  private comboAt = 0;

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
          parsed.inventory ??= {};
          parsed.farmer ??= { col: CS / 2, row: CS / 2 };
          parsed.quests ??= [];
          parsed.daily ??= { last: "", streak: 0 };
          while (parsed.quests.length < 3) parsed.quests.push(genQuest(levelForXp(parsed.xp), parsed.quests.map((q) => q.defId)));
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
      inventory: {},
      farmer: { col: (minC + maxC) / 2, row: (minR + maxR) / 2 },
      quests: this.makeStartingQuests(),
      daily: { last: "", streak: 0 },
      lastSeen: Date.now(),
    };
  }

  private makeStartingQuests(): QuestInstance[] {
    const quests: QuestInstance[] = [];
    for (let i = 0; i < 3; i++) quests.push(genQuest(1, quests.map((q) => q.defId)));
    return quests;
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
    if (after > before) {
      for (let lvl = before + 1; lvl <= after; lvl++) this.onLevelUp(lvl);
      this.trackQuestLevel(after);
    }
    this.save();
  }

  private onLevelUp(lvl: number) {
    const reward = { coins: lvl * 40, gems: lvl % 5 === 0 ? 1 : 0 };
    this.data.coins += reward.coins;
    this.data.gems += reward.gems;
    const unlocked = CROPS.filter((c) => c.unlockLevel === lvl).map((c) => ({ name: c.name, emoji: c.emoji }));
    this.emit("wallet");
    this.emit("levelup", lvl, reward, unlocked);
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
    this.trackQuest("buy");
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
    if (this.hasDecor(col, row)) return false;
    if (!this.spendCoins(CONFIG.tillCost)) return false;
    this.data.tilled[this.key(col, row)] = true;
    this.emit("land");
    this.trackQuest("till");
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
    this.trackQuest("plant");
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

  /** Harvest a ready crop. Returns coins earned (0 if nothing harvested). */
  harvest(col: number, row: number): number {
    const plot = this.getPlot(col, row);
    if (!plot || !this.isReady(plot)) return 0;
    const crop = CROP_BY_ID[plot.cropId];
    delete this.data.plots[this.key(col, row)];
    this.emit("land");
    if (!crop) return 0;

    // Combo: chaining harvests quickly multiplies the payout.
    const now = Date.now();
    this.comboCount = now - this.comboAt < CONFIG.comboWindowMs ? this.comboCount + 1 : 1;
    this.comboAt = now;
    const mult = 1 + Math.min(this.comboCount - 1, CONFIG.comboMaxSteps) * 0.1;
    const gain = Math.round(crop.sellPrice * mult);

    this.addCoins(gain);
    this.addXp(crop.xp);
    this.trackQuest("harvest");
    this.trackQuest("harvestCrop", 1, crop.id);
    this.trackQuest("earn", gain);
    this.emit("combo", this.comboCount, mult);
    this.save();
    return gain;
  }

  // --- Decorations ----------------------------------------------------
  hasDecor(col: number, row: number) {
    return !!this.data.decorations[this.key(col, row)];
  }
  getDecor(col: number, row: number): string | undefined {
    return this.data.decorations[this.key(col, row)];
  }
  canPlaceDecor(col: number, row: number) {
    return this.isOwnedTile(col, row) && this.tileState(col, row) === "grass" && !this.hasDecor(col, row);
  }
  inventoryCount(id: string) {
    return this.data.inventory[id] || 0;
  }
  /** Buy a decoration into the bag (does not place it). */
  buyDecor(id: string): boolean {
    const def = DECOR_BY_ID[id];
    if (!def || !this.spendCoins(def.cost)) return false;
    this.data.inventory[id] = this.inventoryCount(id) + 1;
    this.emit("decor");
    this.save();
    return true;
  }
  /** Place a decoration from the bag onto a tile. */
  placeDecor(col: number, row: number, id: string): boolean {
    if (!this.canPlaceDecor(col, row) || this.inventoryCount(id) <= 0) return false;
    this.data.inventory[id] = this.inventoryCount(id) - 1;
    this.data.decorations[this.key(col, row)] = id;
    this.emit("decor");
    this.save();
    return true;
  }
  /** Pick a placed decoration back up into the bag. */
  removeDecor(col: number, row: number): boolean {
    const id = this.getDecor(col, row);
    if (!id) return false;
    delete this.data.decorations[this.key(col, row)];
    this.data.inventory[id] = this.inventoryCount(id) + 1;
    this.emit("decor");
    this.save();
    return true;
  }

  // --- Farmer position ------------------------------------------------
  setFarmer(col: number, row: number) {
    this.data.farmer = { col, row };
    // not saved every step (caller saves on settle)
  }

  // --- Quests ---------------------------------------------------------
  private trackQuest(type: QuestType, amount = 1, cropId?: string) {
    let changed = false;
    for (const q of this.data.quests) {
      const def = QUEST_BY_ID[q.defId];
      if (!def || def.type !== type) continue;
      if (type === "harvestCrop" && def.cropId !== cropId) continue;
      if (q.progress >= q.target) continue;
      q.progress = Math.min(q.target, q.progress + amount);
      changed = true;
    }
    if (changed) {
      this.emit("quests");
      this.save();
    }
  }

  private trackQuestLevel(level: number) {
    let changed = false;
    for (const q of this.data.quests) {
      const def = QUEST_BY_ID[q.defId];
      if (!def || def.type !== "level" || q.progress >= q.target) continue;
      q.progress = Math.min(q.target, level);
      changed = true;
    }
    if (changed) this.emit("quests");
  }

  questDone(q: { progress: number; target: number }) {
    return q.progress >= q.target;
  }

  /** Number of quests ready to claim (for the notification badge). */
  questsClaimable() {
    return this.data.quests.filter((q) => this.questDone(q)).length;
  }

  claimQuest(index: number): boolean {
    const q = this.data.quests[index];
    if (!q || !this.questDone(q)) return false;
    const def = QUEST_BY_ID[q.defId];
    if (!def) return false;
    if (def.reward.coins) this.data.coins += def.reward.coins;
    if (def.reward.gems) this.data.gems += def.reward.gems;
    const exclude = this.data.quests.map((x) => x.defId);
    this.data.quests[index] = genQuest(this.level, exclude);
    if (def.reward.xp) this.addXp(def.reward.xp);
    this.emit("wallet");
    this.emit("quests");
    this.save();
    return true;
  }

  // --- Daily reward ---------------------------------------------------
  private dayKey(d: Date) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  dailyAvailable() {
    return this.data.daily.last !== this.dayKey(new Date());
  }
  /** Returns the reward granted, or null if already claimed today. */
  claimDaily(): { coins: number; gems: number; day: number; streak: number } | null {
    if (!this.dailyAvailable()) return null;
    const today = this.dayKey(new Date());
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const streak = this.data.daily.last === this.dayKey(y) ? this.data.daily.streak + 1 : 1;
    const day = ((streak - 1) % 7) + 1;
    const coins = 40 + day * 30;
    const gems = day === 7 ? 3 : 0;
    this.data.coins += coins;
    this.data.gems += gems;
    this.data.daily = { last: today, streak };
    this.emit("wallet");
    this.emit("daily");
    this.save();
    return { coins, gems, day, streak };
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
