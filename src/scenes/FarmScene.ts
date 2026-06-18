import Phaser from "phaser";
import { CONFIG } from "../config";
import { GameState } from "../state/GameState";
import { CROP_BY_ID } from "../data/crops";
import { BaseScene, DPR } from "./BaseScene";
import { SS } from "../art/TextureFactory";
import type { UIScene } from "./UIScene";

const W = CONFIG.tileWidth;
const H = CONFIG.tileHeight;
const TILE_SCALE = 1 / SS; // display supersampled textures at design size
const FARMER_SCALE = 1.25 / SS;
const CS = CONFIG.chunkSize;
const TAP_SLOP = 10; // CSS px of movement still counts as a tap

export type Mode = "idle" | "hoe" | "plant";

interface SoilView {
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  readyTween?: Phaser.Tweens.Tween;
}

interface Task {
  col: number;
  row: number;
  action: "till" | "plant" | "harvest" | "walk";
  cropId?: string;
}

export class FarmScene extends BaseScene {
  private ground: Phaser.GameObjects.GameObject[] = [];
  private soil = new Map<string, SoilView>();
  private fences!: Phaser.GameObjects.Graphics;

  private farmer!: Phaser.GameObjects.Image;
  private farmerTile = { col: 0, row: 0 };
  private walkFrameEvt?: Phaser.Time.TimerEvent;

  private queue: Task[] = [];
  private busy = false;
  private moveTween?: Phaser.Tweens.Tween;

  mode: Mode = "idle";
  selectedCropId?: string;

  // Camera / input
  private gz = CONFIG.zoomStart;
  private viewCenter = { x: 0, y: 0 };
  private dragging = false;
  private pinching = false;
  private moved = 0;
  private dragStart = { px: 0, py: 0, sx: 0, sy: 0 };
  private pinchStart = { dist: 0, gz: 1 };

  constructor() {
    super("FarmScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#72ad3e");
    this.fences = this.add.graphics();

    this.buildWorld();
    this.buildFarmer();
    this.syncSoil();

    // Centre on the owned land.
    const c = this.tileCenter(GameState.data.farmer.col, GameState.data.farmer.row);
    this.viewCenter = c;
    this.applyCamera();
    this.cameras.main.centerOn(c.x, c.y);

    GameState.on("land", () => this.syncSoil(), this);
    GameState.on("owned", () => { this.buildWorld(); this.syncSoil(); }, this);
    this.scale.on("resize", () => this.onResize(), this);

    this.input.addPointer(1); // allow 2 simultaneous pointers (pinch)

    this.time.delayedCall(400, () => this.reportOfflineProgress());
  }

  // ---- Tools ---------------------------------------------------------
  setMode(mode: Mode, cropId?: string) {
    this.mode = mode;
    this.selectedCropId = cropId;
    this.events.emit("mode", mode, cropId);
    this.refreshTargets();
  }

  private ui() {
    return this.scene.get("UIScene") as UIScene;
  }

  // ---- Iso coordinates ----------------------------------------------
  private key(col: number, row: number) {
    return `${col},${row}`;
  }
  /** World-space top vertex of a tile. */
  private tilePos(col: number, row: number) {
    return { x: (col - row) * (W / 2), y: (col + row) * (H / 2) };
  }
  private tileCenter(col: number, row: number) {
    const p = this.tilePos(col, row);
    return { x: p.x, y: p.y + H / 2 };
  }
  /** World point -> nearest tile (inverse isometric projection). */
  private pickTile(wx: number, wy: number) {
    const a = (2 * wx) / W;
    const b = (2 * (wy - H / 2)) / H;
    return { col: Math.round((a + b) / 2), row: Math.round((b - a) / 2) };
  }

  // ---- World build ---------------------------------------------------
  private buildWorld() {
    this.ground.forEach((o) => o.destroy());
    this.ground = [];

    const b = GameState.activeBounds();
    const M = 2; // grass margin around the active area
    for (let row = b.minR - M; row <= b.maxR + M; row++) {
      for (let col = b.minC - M; col <= b.maxC + M; col++) {
        const p = this.tilePos(col, row);
        const tex = (col + row) % 2 === 0 ? "tile-grass" : "tile-grass-2";
        const img = this.add
          .image(p.x, p.y, tex)
          .setOrigin(0.5, 0)
          .setScale(TILE_SCALE)
          .setDepth(col + row);
        this.ground.push(img);
      }
    }

    // Buyable plots — highlight + sign.
    for (const { cx, cy } of GameState.buyableChunks()) {
      for (let r = 0; r < CS; r++) {
        for (let c = 0; c < CS; c++) {
          const col = cx * CS + c;
          const row = cy * CS + r;
          const p = this.tilePos(col, row);
          const ov = this.add
            .image(p.x, p.y, "tile-buy")
            .setOrigin(0.5, 0)
            .setScale(TILE_SCALE)
            .setDepth(col + row + 0.05);
          this.ground.push(ov);
        }
      }
      this.addBuySign(cx, cy);
    }

    this.drawFences();
  }

  private addBuySign(cx: number, cy: number) {
    const midCol = cx * CS + (CS - 1) / 2;
    const midRow = cy * CS + (CS - 1) / 2;
    const c = this.tileCenter(midCol, midRow);
    const cont = this.add.container(c.x, c.y).setDepth(midCol + midRow + 50);

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(-58, -22 + 3, 116, 40, 12);
    g.fillStyle(0xffffff, 0.96);
    g.fillRoundedRect(-58, -22, 116, 40, 12);
    const t1 = this.tx(0, -12, "🚜 Buy land", { fontFamily: "Fredoka", fontSize: "15px", fontStyle: "600", color: "#4a3826" }).setOrigin(0.5);
    const t2 = this.tx(0, 6, `🪙 ${GameState.plotCost().toLocaleString()}`, { fontFamily: "Fredoka", fontSize: "15px", fontStyle: "700", color: "#caa12a" }).setOrigin(0.5);
    cont.add([g, t1, t2]);
    cont.setScale(TILE_SCALE * 1.4);
    this.ground.push(cont);
  }

  private drawFences() {
    const g = this.fences;
    g.clear();
    g.setDepth(100000); // above ground; per-segment we rely on draw order
    const rail = 0x8a5a2b;
    const post = 0x6f441e;

    const isOwned = (col: number, row: number) => GameState.isOwnedTile(col, row);

    for (const ownedKey of Object.keys(GameState.data.owned)) {
      const [cx, cy] = ownedKey.split(",").map(Number);
      for (let r = 0; r < CS; r++) {
        for (let c = 0; c < CS; c++) {
          const col = cx * CS + c;
          const row = cy * CS + r;
          const p = this.tilePos(col, row);
          const top = { x: p.x, y: p.y };
          const right = { x: p.x + W / 2, y: p.y + H / 2 };
          const bottom = { x: p.x, y: p.y + H };
          const left = { x: p.x - W / 2, y: p.y + H / 2 };
          // edge -> outward neighbour
          const edges: [{ x: number; y: number }, { x: number; y: number }, number, number][] = [
            [top, right, col, row - 1],
            [right, bottom, col + 1, row],
            [bottom, left, col, row + 1],
            [left, top, col - 1, row],
          ];
          for (const [A, B, nc, nr] of edges) {
            if (isOwned(nc, nr)) continue;
            // rail
            g.lineStyle(3, rail, 1);
            g.beginPath();
            g.moveTo(A.x, A.y - 9);
            g.lineTo(B.x, B.y - 9);
            g.strokePath();
            // posts
            g.lineStyle(3, post, 1);
            for (const P of [A, B]) {
              g.beginPath();
              g.moveTo(P.x, P.y);
              g.lineTo(P.x, P.y - 12);
              g.strokePath();
            }
          }
        }
      }
    }
  }

  private buildFarmer() {
    this.farmer = this.add
      .image(0, 0, "farmer-0")
      .setOrigin(0.5, 1)
      .setScale(FARMER_SCALE);
    this.placeFarmer(GameState.data.farmer.col, GameState.data.farmer.row);
  }

  private placeFarmer(col: number, row: number) {
    this.farmerTile = { col, row };
    const c = this.tileCenter(col, row);
    this.farmer.setPosition(c.x, c.y + 4);
    this.farmer.setDepth(col + row + 0.35);
  }

  // ---- Soil / crops --------------------------------------------------
  private syncSoil() {
    // Remove views for tiles that are no longer tilled.
    for (const [key, view] of this.soil) {
      const [col, row] = key.split(",").map(Number);
      if (GameState.tileState(col, row) === "grass") {
        view.readyTween?.stop();
        view.soil.destroy();
        view.crop.destroy();
        view.bar.destroy();
        this.soil.delete(key);
      }
    }
    // Add/refresh tilled tiles.
    for (const key of Object.keys(GameState.data.tilled)) {
      const [col, row] = key.split(",").map(Number);
      if (!this.soil.has(key)) this.soil.set(key, this.makeSoil(col, row));
    }
  }

  private makeSoil(col: number, row: number): SoilView {
    const p = this.tilePos(col, row);
    const soil = this.add.image(p.x, p.y, "tile-soil").setOrigin(0.5, 0).setScale(TILE_SCALE).setDepth(col + row + 0.1);
    const c = this.tileCenter(col, row);
    const crop = this.tx(c.x, c.y + 6, "", { fontFamily: "Fredoka", fontSize: "40px" }).setOrigin(0.5, 0.85).setDepth(col + row + 0.3);
    const bar = this.add.graphics().setDepth(col + row + 0.31);
    return { soil, crop, bar };
  }

  // ---- Tap / camera input -------------------------------------------
  update() {
    this.handleCameraInput();
    this.animateCrops();
    this.animateTargets();
  }

  private handleCameraInput() {
    if (this.ui().isModalOpen()) {
      this.dragging = false;
      this.pinching = false;
      return;
    }
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    const cam = this.cameras.main;

    if (p1.isDown && p2.isDown) {
      // Pinch zoom.
      const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (!this.pinching) {
        this.pinching = true;
        this.dragging = false;
        this.pinchStart = { dist, gz: this.gz };
      } else if (this.pinchStart.dist > 0) {
        this.gz = Phaser.Math.Clamp(
          (this.pinchStart.gz * dist) / this.pinchStart.dist,
          CONFIG.zoomMin,
          CONFIG.zoomMax
        );
        cam.setZoom(DPR * this.gz);
        this.viewCenter = { x: cam.midPoint.x, y: cam.midPoint.y };
      }
      return;
    }

    if (p1.isDown) {
      if (!this.dragging && !this.pinching) {
        this.dragging = true;
        this.moved = 0;
        this.dragStart = { px: p1.x, py: p1.y, sx: cam.scrollX, sy: cam.scrollY };
      } else if (this.dragging) {
        const dx = p1.x - this.dragStart.px;
        const dy = p1.y - this.dragStart.py;
        this.moved = Math.max(this.moved, Math.hypot(dx, dy) / DPR);
        cam.scrollX = this.dragStart.sx - dx / cam.zoom;
        cam.scrollY = this.dragStart.sy - dy / cam.zoom;
        this.viewCenter = { x: cam.midPoint.x, y: cam.midPoint.y };
      }
      return;
    }

    // No pointers down: resolve a release.
    if (this.dragging) {
      const wasTap = this.moved < TAP_SLOP && !this.pinching;
      const upX = this.input.activePointer.x;
      const upY = this.input.activePointer.y;
      this.dragging = false;
      if (wasTap) this.onTap(this.input.activePointer);
      void upX; void upY;
    }
    this.pinching = false;
  }

  private onTap(pointer: Phaser.Input.Pointer) {
    // Ignore taps that land on the HUD / toolbar / an open menu.
    if (this.ui().blocksWorldInput(pointer.x / DPR, pointer.y / DPR)) return;

    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { col, row } = this.pickTile(wp.x, wp.y);
    const { cx, cy } = GameState.chunkOf(col, row);

    // Buyable plot?
    if (GameState.buyableChunks().some((c) => c.cx === cx && c.cy === cy)) {
      this.ui().promptBuy(cx, cy);
      return;
    }

    const owned = GameState.isOwnedTile(col, row);
    const state = GameState.tileState(col, row);

    if (this.mode === "hoe") {
      if (owned && state === "grass") this.enqueue({ col, row, action: "till" }, true);
      else this.ui().toast(owned ? "Already worked here" : "You don't own this land");
      return;
    }
    if (this.mode === "plant") {
      if (owned && state === "soil") this.enqueue({ col, row, action: "plant", cropId: this.selectedCropId }, true);
      else if (owned && state === "grass") this.ui().toast("🪓 Hoe this tile first");
      else if (owned) this.ui().toast("Something's already growing");
      else this.ui().toast("You don't own this land");
      return;
    }

    // idle: harvest ready crop, otherwise just walk there.
    const plot = GameState.getPlot(col, row);
    if (owned && plot && GameState.isReady(plot)) {
      this.enqueue({ col, row, action: "harvest" }, true);
    } else {
      this.replaceWalk(col, row);
      if (plot) this.ui().toast(`Growing — ${formatTime(GameState.secondsLeft(plot))} left`);
    }
  }

  // ---- Farmer movement & action queue -------------------------------
  private replaceWalk(col: number, row: number) {
    this.queue = [];
    if (this.moveTween) {
      // Let the current move finish into a redirect.
    }
    this.enqueue({ col, row, action: "walk" }, false);
  }

  private enqueue(task: Task, append: boolean) {
    if (!append && this.busy) {
      this.queue = [task];
      // current move will continue; queue picks up after
    } else {
      this.queue.push(task);
    }
    if (!this.busy) this.processQueue();
  }

  private processQueue() {
    const task = this.queue.shift();
    if (!task) {
      this.busy = false;
      this.stopWalkAnim();
      GameState.setFarmer(this.farmerTile.col, this.farmerTile.row);
      GameState.save();
      return;
    }
    this.busy = true;
    this.walkTo(task.col, task.row, () => {
      if (task.action !== "walk") this.executeTask(task);
      this.time.delayedCall(task.action === "walk" ? 0 : 130, () => this.processQueue());
    });
  }

  private walkTo(col: number, row: number, onArrive: () => void) {
    const target = this.tileCenter(col, row);
    const fromX = this.farmer.x;
    const fromY = this.farmer.y;
    const dist = Phaser.Math.Distance.Between(fromX, fromY, target.x, target.y + 4);
    const duration = Math.max(CONFIG.walkMinMs, (dist / CONFIG.walkSpeed) * 1000);

    this.farmer.setFlipX(target.x < fromX - 1);
    this.startWalkAnim();
    this.farmer.setDepth(100001);

    this.moveTween?.stop();
    this.moveTween = this.tweens.add({
      targets: this.farmer,
      x: target.x,
      y: target.y + 4,
      duration,
      ease: "Sine.inOut",
      onUpdate: () => {
        const t = this.pickTile(this.farmer.x, this.farmer.y - 4);
        this.farmer.setDepth(t.col + t.row + 0.35);
      },
      onComplete: () => {
        this.placeFarmer(col, row);
        onArrive();
      },
    });
  }

  private startWalkAnim() {
    if (this.walkFrameEvt) return;
    let f = 0;
    this.walkFrameEvt = this.time.addEvent({
      delay: 130,
      loop: true,
      callback: () => {
        f ^= 1;
        this.farmer.setTexture(f ? "farmer-1" : "farmer-0");
      },
    });
  }
  private stopWalkAnim() {
    this.walkFrameEvt?.remove();
    this.walkFrameEvt = undefined;
    this.farmer.setTexture("farmer-0");
  }

  private executeTask(task: Task) {
    const s = this.tileCenter(task.col, task.row);
    if (task.action === "till") {
      if (GameState.till(task.col, task.row)) this.dust(s.x, s.y, 0xb98a55);
    } else if (task.action === "plant") {
      if (task.cropId && GameState.plant(task.col, task.row, task.cropId)) {
        this.dust(s.x, s.y, 0x6fbf3a);
        this.popCrop(task.col, task.row);
      } else this.ui().toast("Can't plant there");
    } else if (task.action === "harvest") {
      const plot = GameState.getPlot(task.col, task.row);
      const crop = plot ? CROP_BY_ID[plot.cropId] : undefined;
      if (GameState.harvest(task.col, task.row) && crop) {
        this.coinBurst(s.x, s.y);
        this.floatWorld(s.x, s.y, `+${crop.sellPrice}🪙`);
      }
    }
  }

  private popCrop(col: number, row: number) {
    const v = this.soil.get(this.key(col, row));
    if (!v) return;
    this.tweens.add({ targets: v.crop, scaleX: { from: 0.2, to: 1 }, scaleY: { from: 0.2, to: 1 }, duration: 260, ease: "Back.out" });
  }

  // ---- Effects -------------------------------------------------------
  private dust(x: number, y: number, tint: number) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 40, max: 120 }, angle: { min: 200, max: 340 }, gravityY: 300,
      scale: { start: 0.6 / SS, end: 0 }, tint: [tint, 0xe8d3b0], lifespan: 460, quantity: 8, emitting: false,
    });
    e.setDepth(100002);
    e.explode(8);
    this.time.delayedCall(600, () => e.destroy());
  }
  private coinBurst(x: number, y: number) {
    const e = this.add.particles(x, y, "spark", {
      speed: { min: 80, max: 220 }, angle: { min: 200, max: 340 }, gravityY: 520,
      scale: { start: 0.8 / SS, end: 0 }, tint: [0xffe169, 0xffc83d, 0xfff4c2], lifespan: 650, quantity: 14, emitting: false,
    });
    e.setDepth(100002);
    e.explode(14);
    this.time.delayedCall(800, () => e.destroy());
  }

  // ---- Targets / crop animation -------------------------------------
  private refreshTargets() {
    // (visual target pulse computed live in animateTargets)
  }

  private animateTargets() {
    // Pulse ready crops in idle mode for harvest guidance.
    if (this.mode !== "idle") return;
    const pulse = 0.85 + 0.15 * Math.sin(this.time.now / 250);
    for (const [key, v] of this.soil) {
      const [col, row] = key.split(",").map(Number);
      const plot = GameState.getPlot(col, row);
      if (plot && GameState.isReady(plot)) v.crop.setAlpha(1);
      void pulse;
    }
  }

  private animateCrops() {
    for (const [key, v] of this.soil) {
      const [col, row] = key.split(",").map(Number);
      const plot = GameState.getPlot(col, row);
      if (!plot) {
        if (v.crop.text) { v.crop.setText(""); v.bar.clear(); v.readyTween?.stop(); v.readyTween = undefined; }
        continue;
      }
      const crop = CROP_BY_ID[plot.cropId];
      if (!crop) continue;
      const ratio = GameState.growthRatio(plot);
      const glyph = ratio < 0.34 ? "🌱" : crop.emoji;
      if (v.crop.text !== glyph) v.crop.setText(glyph);
      const center = this.tileCenter(col, row);

      if (ratio >= 1) {
        v.bar.clear();
        if (!v.readyTween) {
          v.crop.setScale(1);
          v.readyTween = this.tweens.add({
            targets: v.crop, y: { from: center.y + 6, to: center.y - 4 },
            scaleX: { from: 1, to: 1.1 }, scaleY: { from: 1, to: 1.1 },
            duration: 520, yoyo: true, repeat: -1, ease: "Sine.inOut",
          });
        }
      } else if (!this.tweens.isTweening(v.crop)) {
        v.crop.setScale(0.45 + ratio * 0.5).setY(center.y + 6);
        this.drawBar(v, col, row, ratio);
      }
    }
  }

  private drawBar(v: SoilView, col: number, row: number, ratio: number) {
    const c = this.tileCenter(col, row);
    const g = v.bar;
    g.clear();
    const bw = 42, bx = c.x - bw / 2, by = c.y - 26;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(bx - 1, by - 1, bw + 2, 8, 3);
    g.fillStyle(0x2f9e44, 1);
    g.fillRoundedRect(bx, by, bw * ratio, 6, 3);
  }

  private floatWorld(x: number, y: number, text: string) {
    const t = this.tx(x, y, text, { fontFamily: "Fredoka", fontSize: "24px", fontStyle: "700", color: "#ffe169" })
      .setOrigin(0.5)
      .setDepth(100003);
    t.setStroke("#5a3a1a", 5);
    this.tweens.add({ targets: t, y: y - 50, alpha: { from: 1, to: 0 }, duration: 900, ease: "Cubic.out", onComplete: () => t.destroy() });
  }

  /** Public: snap the camera back to the farmer / owned land. */
  recenterView() {
    this.gz = CONFIG.zoomStart;
    this.applyCamera();
    const c = this.tileCenter(this.farmerTile.col, this.farmerTile.row);
    this.viewCenter = c;
    this.cameras.main.centerOn(c.x, c.y);
  }

  // ---- Camera helpers ------------------------------------------------
  private applyCamera() {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(DPR * this.gz);
  }
  private onResize() {
    this.applyCamera();
    this.cameras.main.centerOn(this.viewCenter.x, this.viewCenter.y);
  }

  private reportOfflineProgress() {
    let ready = 0;
    for (const k of Object.keys(GameState.data.plots)) {
      if (GameState.isReady(GameState.data.plots[k])) ready++;
    }
    if (ready > 0) this.ui().toast(`🌾 ${ready} crop${ready > 1 ? "s" : ""} ready to harvest!`);
  }
}

export function formatTime(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}
