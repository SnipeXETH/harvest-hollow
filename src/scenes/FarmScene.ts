import Phaser from "phaser";
import { CONFIG } from "../config";
import { GameState } from "../state/GameState";
import { CROP_BY_ID } from "../data/crops";
import { COLORS } from "../theme";
import { BaseScene } from "./BaseScene";
import type { UIScene } from "./UIScene";

const W = CONFIG.tileWidth;
const H = CONFIG.tileHeight;
const ISLAND_DEPTH = 18;

export type Mode = "idle" | "hoe" | "plant";

interface TileView {
  col: number;
  row: number;
  locked: boolean;
  container: Phaser.GameObjects.Container;
  base: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  grid: Phaser.GameObjects.Image;
  target: Phaser.GameObjects.Image;
  readyTween?: Phaser.Tweens.Tween;
}

interface Task {
  col: number;
  row: number;
  action: "till" | "plant" | "harvest";
  cropId?: string;
}

export class FarmScene extends BaseScene {
  private board!: Phaser.GameObjects.Container;
  private island!: Phaser.GameObjects.Graphics;
  private backdrop!: Phaser.GameObjects.Graphics;
  private tiles = new Map<string, TileView>();

  private farmer!: Phaser.GameObjects.Container;
  private farmerSprite!: Phaser.GameObjects.Text;
  private farmerTile = { col: 0, row: 0 };

  private queue: Task[] = [];
  private busy = false;

  mode: Mode = "idle";
  selectedCropId?: string;

  constructor() {
    super("FarmScene");
  }

  create() {
    this.applyHiDPI();

    this.backdrop = this.add.graphics().setDepth(-1000);
    this.drawBackdrop();

    this.board = this.add.container(0, 0);
    this.island = this.add.graphics();
    this.board.add(this.island);

    this.buildBoard();
    this.buildFarmer();

    GameState.on("land", () => this.syncTiles(), this);
    GameState.on("grid", () => this.buildBoard(), this);
    this.scale.on("resize", () => this.layout(), this);

    this.time.delayedCall(400, () => this.reportOfflineProgress());
  }

  // ---- Mode / tools --------------------------------------------------
  setMode(mode: Mode, cropId?: string) {
    this.mode = mode;
    this.selectedCropId = cropId;
    this.events.emit("mode", mode, cropId);
    this.refreshOverlays();
  }

  // ---- Coordinates ---------------------------------------------------
  private key(col: number, row: number) {
    return `${col},${row}`;
  }

  /** Local top-vertex of a tile within the board container. */
  private tilePos(col: number, row: number) {
    const n = GameState.gridSize;
    return {
      x: (col - row) * (W / 2),
      y: (col + row) * (H / 2) - ((n - 1) * H) / 2,
    };
  }

  /** Local centre of a tile's top face. */
  private tileCenter(col: number, row: number) {
    const p = this.tilePos(col, row);
    return { x: p.x, y: p.y + H / 2 };
  }

  // ---- Board build ---------------------------------------------------
  private buildBoard() {
    this.tiles.forEach((t) => t.container.destroy());
    this.tiles.clear();

    const n = GameState.gridSize;
    const showLocked = GameState.canExpand();
    const previewN = showLocked ? n + 1 : n;

    const coords: { col: number; row: number; locked: boolean }[] = [];
    for (let col = 0; col < previewN; col++) {
      for (let row = 0; row < previewN; row++) {
        coords.push({ col, row, locked: col >= n || row >= n });
      }
    }
    coords.sort((a, b) => a.col + a.row - (b.col + b.row));

    for (const { col, row, locked } of coords) {
      this.tiles.set(this.key(col, row), this.makeTile(col, row, locked));
    }

    this.drawIsland();
    if (this.farmer) this.board.bringToTop(this.farmer);
    this.layout();
    this.refreshOverlays();
  }

  private makeTile(col: number, row: number, locked: boolean): TileView {
    const container = this.add.container(0, 0);
    const base = this.add.image(0, 0, "tile-grass").setOrigin(0.5, 0);
    const crop = this.tx(0, H / 2, "", { fontSize: "40px" }).setOrigin(0.5, 0.8);
    const bar = this.add.graphics();
    const grid = this.add.image(0, 0, "tile-grid").setOrigin(0.5, 0).setVisible(false);
    const target = this.add.image(0, 0, "tile-target").setOrigin(0.5, 0).setVisible(false);

    container.add([base, grid, target, crop, bar]);
    this.board.add(container);

    const poly = new Phaser.Geom.Polygon([W / 2, 0, W, H / 2, W / 2, H, 0, H / 2]);
    base.setInteractive(poly, Phaser.Geom.Polygon.Contains);
    base.on("pointerdown", () => this.onTileTap(col, row, locked));

    const view: TileView = { col, row, locked, container, base, crop, bar, grid, target };
    this.refreshTile(view);
    return view;
  }

  private buildFarmer() {
    this.farmer = this.add.container(0, 0);
    this.farmerSprite = this.tx(0, 0, "🧑‍🌾", { fontSize: "40px" }).setOrigin(0.5, 0.92);
    this.farmer.add(this.farmerSprite);
    this.board.add(this.farmer);

    const n = GameState.gridSize;
    this.farmerTile = { col: Math.floor(n / 2), row: Math.floor(n / 2) };
    const c = this.tileCenter(this.farmerTile.col, this.farmerTile.row);
    this.farmer.setPosition(c.x, c.y);
    this.farmer.setDepth(this.farmerTile.col + this.farmerTile.row - 0.1);
  }

  // ---- Island & backdrop --------------------------------------------
  private drawBackdrop() {
    const width = this.vw;
    const height = this.vh;
    this.backdrop.clear();
    this.backdrop.fillGradientStyle(
      COLORS.skyTop,
      COLORS.skyTop,
      COLORS.skyBottom,
      COLORS.skyBottom,
      1
    );
    this.backdrop.fillRect(0, 0, width, height);
  }

  private drawIsland() {
    const n = GameState.gridSize;
    const A = this.tilePos(0, 0); // top corner
    const B = this.tilePos(n - 1, 0); // right tile
    const C = this.tilePos(n - 1, n - 1); // bottom tile
    const D = this.tilePos(0, n - 1); // left tile
    const top = { x: A.x, y: A.y };
    const right = { x: B.x + W / 2, y: B.y + H / 2 };
    const bottom = { x: C.x, y: C.y + H };
    const left = { x: D.x - W / 2, y: D.y + H / 2 };
    const d = ISLAND_DEPTH;

    const g = this.island;
    g.clear();

    // Drop shadow.
    g.fillStyle(0x000000, 0.12);
    g.fillEllipse(0, bottom.y + d - 2, (right.x - left.x) * 0.92, H * 1.3);

    // Left dirt face.
    g.fillStyle(0x6f3f20, 1);
    g.beginPath();
    g.moveTo(left.x, left.y);
    g.lineTo(bottom.x, bottom.y);
    g.lineTo(bottom.x, bottom.y + d);
    g.lineTo(left.x, left.y + d);
    g.closePath();
    g.fillPath();

    // Right dirt face (slightly lighter).
    g.fillStyle(0x7c4a29, 1);
    g.beginPath();
    g.moveTo(bottom.x, bottom.y);
    g.lineTo(right.x, right.y);
    g.lineTo(right.x, right.y + d);
    g.lineTo(bottom.x, bottom.y + d);
    g.closePath();
    g.fillPath();

    // Grass top (sits exactly under the tiles; fills any seams).
    g.fillStyle(0x7cc24a, 1);
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(right.x, right.y);
    g.lineTo(bottom.x, bottom.y);
    g.lineTo(left.x, left.y);
    g.closePath();
    g.fillPath();

    this.island.setDepth(-50);
  }

  // ---- Layout --------------------------------------------------------
  private layout() {
    this.applyHiDPI();
    this.drawBackdrop();
    const width = this.vw;
    const height = this.vh;
    const n = GameState.gridSize + (GameState.canExpand() ? 1 : 0);
    const boardWidth = n * W;
    const scale = Phaser.Math.Clamp((width * 0.96) / boardWidth, 0.3, 1.1);

    this.board.setScale(scale);
    this.board.setPosition(width / 2, height * 0.32);

    this.tiles.forEach((t) => {
      const { x, y } = this.tilePos(t.col, t.row);
      t.container.setPosition(x, y);
      t.container.setDepth(t.col + t.row);
    });
  }

  // ---- Tile visuals --------------------------------------------------
  private syncTiles() {
    this.tiles.forEach((t) => this.refreshTile(t));
    this.refreshOverlays();
  }

  private refreshTile(view: TileView) {
    view.readyTween?.stop();
    view.readyTween = undefined;
    view.crop.setScale(1).setAngle(0).setY(H / 2);

    if (view.locked) {
      view.base.setTexture("tile-grass-locked");
      view.crop.setText("");
      view.bar.clear();
      return;
    }

    const state = GameState.tileState(view.col, view.row);
    view.base.setTexture(state === "grass" ? "tile-grass" : "tile-soil");
    if (state !== "planted") {
      view.crop.setText("");
      view.bar.clear();
    }
  }

  /** Show/hide grid lines + valid-target highlights for the current mode. */
  private refreshOverlays() {
    this.tiles.forEach((t) => {
      if (t.locked) {
        t.grid.setVisible(false);
        t.target.setVisible(false);
        return;
      }
      t.grid.setVisible(this.mode !== "idle");
      t.target.setVisible(this.isValidTarget(t.col, t.row));
    });
  }

  private isValidTarget(col: number, row: number): boolean {
    const state = GameState.tileState(col, row);
    if (this.mode === "hoe") return state === "grass";
    if (this.mode === "plant") return state === "soil";
    // idle: highlight crops ready to harvest.
    const plot = GameState.getPlot(col, row);
    return !!plot && GameState.isReady(plot);
  }

  // ---- Interaction ---------------------------------------------------
  private ui() {
    return this.scene.get("UIScene") as UIScene;
  }

  private onTileTap(col: number, row: number, locked: boolean) {
    if (locked) {
      this.ui().promptExpand();
      return;
    }
    const state = GameState.tileState(col, row);

    if (this.mode === "hoe") {
      if (state === "grass") this.enqueue({ col, row, action: "till" });
      else this.ui().toast("Already tilled here");
      return;
    }

    if (this.mode === "plant") {
      if (state === "soil") {
        this.enqueue({ col, row, action: "plant", cropId: this.selectedCropId });
      } else if (state === "grass") {
        this.ui().toast("🪓 Hoe this tile first");
      } else {
        this.ui().toast("Something's already growing");
      }
      return;
    }

    // idle
    const plot = GameState.getPlot(col, row);
    if (plot && GameState.isReady(plot)) {
      this.enqueue({ col, row, action: "harvest" });
    } else if (plot) {
      this.ui().toast(`Growing — ${formatTime(GameState.secondsLeft(plot))} left`);
    } else {
      this.ui().toast("Pick a tool below to start 🪓");
    }
  }

  // ---- Farmer + action queue ----------------------------------------
  private enqueue(task: Task) {
    this.queue.push(task);
    if (!this.busy) this.processQueue();
  }

  private processQueue() {
    const task = this.queue.shift();
    if (!task) {
      this.busy = false;
      return;
    }
    this.busy = true;
    this.walkTo(task.col, task.row, () => {
      this.executeTask(task);
      this.time.delayedCall(140, () => this.processQueue());
    });
  }

  private walkTo(col: number, row: number, onArrive: () => void) {
    const target = this.tileCenter(col, row);
    const dist = Phaser.Math.Distance.Between(
      this.farmerTile.col,
      this.farmerTile.row,
      col,
      row
    );
    const duration = Phaser.Math.Clamp(
      dist * CONFIG.walkMsPerTile,
      CONFIG.walkMinMs,
      CONFIG.walkMaxMs
    );

    // Face travel direction.
    if (target.x < this.farmer.x - 1) this.farmerSprite.setScale(-1, 1);
    else if (target.x > this.farmer.x + 1) this.farmerSprite.setScale(1, 1);

    this.farmer.setDepth(99999);
    // Walking hop.
    this.tweens.add({
      targets: this.farmerSprite,
      y: -8,
      duration: 150,
      yoyo: true,
      repeat: Math.max(0, Math.floor(duration / 300)),
      ease: "Sine.inOut",
    });
    this.tweens.add({
      targets: this.farmer,
      x: target.x,
      y: target.y,
      duration,
      ease: "Sine.inOut",
      onComplete: () => {
        this.farmerTile = { col, row };
        this.farmerSprite.setY(0);
        this.farmer.setDepth(col + row - 0.1);
        onArrive();
      },
    });
  }

  private executeTask(task: Task) {
    const screen = this.tileScreen(task.col, task.row);
    if (task.action === "till") {
      if (GameState.till(task.col, task.row)) this.dust(screen.x, screen.y);
    } else if (task.action === "plant") {
      if (task.cropId && GameState.plant(task.col, task.row, task.cropId)) {
        this.dust(screen.x, screen.y, 0x6fbf3a);
        this.popTile(task.col, task.row);
      } else if (!GameState.canAfford(0)) {
        this.ui().toast("Not enough coins for seeds");
      }
    } else if (task.action === "harvest") {
      const plot = GameState.getPlot(task.col, task.row);
      const crop = plot ? CROP_BY_ID[plot.cropId] : undefined;
      if (GameState.harvest(task.col, task.row) && crop) {
        this.coinBurst(screen.x, screen.y);
        this.ui().floatText(screen.x, screen.y, `+${crop.sellPrice}🪙`, 0xffe169);
      }
    }
  }

  private popTile(col: number, row: number) {
    const view = this.tiles.get(this.key(col, row));
    if (!view) return;
    this.tweens.add({
      targets: view.crop,
      scaleX: { from: 0.2, to: 1 },
      scaleY: { from: 0.2, to: 1 },
      duration: 280,
      ease: "Back.out",
    });
  }

  /** Screen-space centre of a tile (for particle/float effects). */
  private tileScreen(col: number, row: number) {
    const c = this.tileCenter(col, row);
    return {
      x: this.board.x + c.x * this.board.scaleX,
      y: this.board.y + c.y * this.board.scaleY,
    };
  }

  private dust(x: number, y: number, tint = 0xb98a55) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 40, max: 120 },
      angle: { min: 200, max: 340 },
      gravityY: 300,
      scale: { start: 0.7, end: 0 },
      tint: [tint, 0xe8d3b0],
      lifespan: 480,
      quantity: 8,
      emitting: false,
    });
    e.setDepth(100000);
    e.explode(8);
    this.time.delayedCall(600, () => e.destroy());
  }

  private coinBurst(x: number, y: number) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 80, max: 220 },
      angle: { min: 200, max: 340 },
      gravityY: 520,
      scale: { start: 0.9, end: 0 },
      tint: [0xffe169, 0xffc83d, 0xfff4c2],
      lifespan: 650,
      quantity: 14,
      emitting: false,
    });
    e.setDepth(100000);
    e.explode(14);
    this.time.delayedCall(800, () => e.destroy());
  }

  private reportOfflineProgress() {
    let ready = 0;
    for (const k of Object.keys(GameState.data.plots)) {
      if (GameState.isReady(GameState.data.plots[k])) ready++;
    }
    if (ready > 0) {
      this.ui().toast(`🌾 ${ready} crop${ready > 1 ? "s" : ""} ready to harvest!`);
    }
  }

  // ---- Per-frame -----------------------------------------------------
  update(_t: number, _dt: number) {
    const pulse = 0.45 + 0.3 * Math.sin(this.time.now / 220);

    this.tiles.forEach((view) => {
      if (view.target.visible) view.target.setAlpha(pulse);

      if (view.locked) return;
      const plot = GameState.getPlot(view.col, view.row);
      if (!plot) return;
      const crop = CROP_BY_ID[plot.cropId];
      if (!crop) return;
      const ratio = GameState.growthRatio(plot);

      const glyph = ratio < 0.34 ? "🌱" : crop.emoji;
      if (view.crop.text !== glyph) view.crop.setText(glyph);

      if (ratio >= 1) {
        view.bar.clear();
        if (!view.readyTween) {
          view.crop.setScale(1);
          view.readyTween = this.tweens.add({
            targets: view.crop,
            y: { from: H / 2, to: H / 2 - 8 },
            scaleX: { from: 1, to: 1.12 },
            scaleY: { from: 1, to: 1.12 },
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });
        }
      } else if (!this.tweens.isTweening(view.crop)) {
        view.crop.setScale(0.45 + ratio * 0.5).setY(H / 2);
        this.drawBar(view, ratio);
      }
    });
  }

  private drawBar(view: TileView, ratio: number) {
    const g = view.bar;
    g.clear();
    const bw = 42;
    const bx = -bw / 2;
    const by = -8;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(bx - 1, by - 1, bw + 2, 8, 3);
    g.fillStyle(0x2f9e44, 1);
    g.fillRoundedRect(bx, by, bw * ratio, 6, 3);
  }
}

export function formatTime(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}
