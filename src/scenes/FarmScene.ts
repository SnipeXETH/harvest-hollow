import Phaser from "phaser";
import { CONFIG } from "../config";
import { GameState } from "../state/GameState";
import { CROP_BY_ID } from "../data/crops";
import { BaseScene, DPR } from "./BaseScene";
import { SS, CROP_TEX } from "../art/TextureFactory";
import { UI } from "../ui/ui";
import { Sound } from "../audio/sound";

const W = CONFIG.tileWidth;
const H = CONFIG.tileHeight;
const TILE_SCALE = 1 / SS; // display supersampled textures at design size
const FARMER_SCALE = 1.25 / SS;
const DECOR_SCALE = 1 / SS;
const CS = CONFIG.chunkSize;
const TAP_SLOP = 10; // CSS px of movement still counts as a tap

export type Mode = "idle" | "hoe" | "plant" | "place" | "remove";

interface SoilView {
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
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
  private targets: Phaser.GameObjects.Image[] = [];
  private fences!: Phaser.GameObjects.Graphics;

  private farmer!: Phaser.GameObjects.Image;
  private farmerTile = { col: 0, row: 0 };
  private walkFrameEvt?: Phaser.Time.TimerEvent;

  private queue: Task[] = [];
  private busy = false;
  private moveTween?: Phaser.Tweens.Tween;
  private markers = new Map<string, Phaser.GameObjects.Container>();
  private workG?: Phaser.GameObjects.Graphics;
  private chopTween?: Phaser.Tweens.Tween;
  private multiTouch = false;

  mode: Mode = "idle";
  selectedCropId?: string;
  selectedDecorId?: string;
  private decorViews = new Map<string, Phaser.GameObjects.Image>();

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
    this.syncDecor();

    // Centre on the owned land.
    const c = this.tileCenter(GameState.data.farmer.col, GameState.data.farmer.row);
    this.viewCenter = c;
    this.applyCamera();
    this.cameras.main.centerOn(c.x, c.y);

    UI.bindFarm(this);

    GameState.on("land", () => { this.syncSoil(); this.refreshTargets(); }, this);
    GameState.on("decor", () => { this.syncDecor(); this.refreshTargets(); }, this);
    GameState.on("owned", () => { this.buildWorld(); this.syncSoil(); this.syncDecor(); this.refreshTargets(); }, this);
    this.scale.on("resize", () => this.onResize(), this);

    this.input.addPointer(1); // allow 2 simultaneous pointers (pinch)

    // Resolve world taps from the canvas's LIVE bounding rect so targeting
    // stays pixel-accurate even as the mobile address bar resizes the page.
    this.game.canvas.addEventListener("pointerdown", () => { this.moved = 0; });
    this.game.canvas.addEventListener("pointerup", (e) => this.onCanvasPointerUp(e));

    const loader = document.getElementById("loading");
    if (loader) {
      loader.style.opacity = "0";
      setTimeout(() => loader.remove(), 500);
    }

    this.time.delayedCall(400, () => this.reportOfflineProgress());
  }

  // ---- Tools ---------------------------------------------------------
  setMode(mode: Mode, cropId?: string, decorId?: string) {
    this.mode = mode;
    this.selectedCropId = cropId;
    this.selectedDecorId = decorId;
    this.events.emit("mode", mode, cropId, decorId);
    this.refreshTargets();
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

    // Buyable plots — just a sign indicator (no full-area highlight).
    for (const { cx, cy } of GameState.buyableChunks()) {
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
    // wooden signpost
    g.fillStyle(0x5e3a1d, 1);
    g.fillRect(-3, 14, 6, 26); // post
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(-62, -24 + 4, 124, 46, 11);
    g.fillStyle(0x8a5830, 1); // board
    g.fillRoundedRect(-62, -24, 124, 46, 11);
    g.lineStyle(3, 0x432913, 1);
    g.strokeRoundedRect(-62, -24, 124, 46, 11);
    g.lineStyle(2, 0xf2ab1e, 0.85); // gold inner trim
    g.strokeRoundedRect(-56, -19, 112, 36, 8);
    const t1 = this.tx(0, -12, "🚜 Buy Land", { fontFamily: "Fredoka", fontSize: "15px", fontStyle: "700", color: "#fff3d6" }).setOrigin(0.5);
    const t2 = this.tx(0, 7, `🪙 ${GameState.plotCost().toLocaleString()}`, { fontFamily: "Fredoka", fontSize: "16px", fontStyle: "700", color: "#ffe48c" }).setOrigin(0.5);
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
    // Behind the crop on the same tile so the plant stays visible.
    this.farmer.setDepth(col + row + 0.2);
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
    const crop = this.add
      .image(c.x, c.y, "sprout-cluster")
      .setOrigin(0.5, CROP_TEX.centerOriginY)
      .setScale(TILE_SCALE)
      .setDepth(col + row + 0.3)
      .setVisible(false);
    const bar = this.add.graphics().setDepth(col + row + 0.31);
    return { soil, crop, bar };
  }

  // ---- Decorations ---------------------------------------------------
  private syncDecor() {
    // Remove views whose decoration is gone.
    for (const [key, img] of this.decorViews) {
      if (!GameState.data.decorations[key]) {
        img.destroy();
        this.decorViews.delete(key);
      }
    }
    // Add/update existing decorations.
    for (const key of Object.keys(GameState.data.decorations)) {
      const id = GameState.data.decorations[key];
      const [col, row] = key.split(",").map(Number);
      let img = this.decorViews.get(key);
      if (!img) {
        const c = this.tileCenter(col, row);
        img = this.add
          .image(c.x, c.y + 6, `decor-${id}`)
          .setOrigin(0.5, 1)
          .setScale(DECOR_SCALE)
          .setDepth(col + row + 0.45);
        this.decorViews.set(key, img);
      } else if (img.texture.key !== `decor-${id}`) {
        img.setTexture(`decor-${id}`);
      }
    }
  }

  // ---- Tap / camera input -------------------------------------------
  update() {
    this.handleCameraInput();
    this.animateCrops();
    this.animateTargets();
  }

  private handleCameraInput() {
    if (UI.isModalOpen()) {
      this.dragging = false;
      this.pinching = false;
      return;
    }
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    const cam = this.cameras.main;

    if (p1.isDown && p2.isDown) {
      // Pinch zoom.
      this.multiTouch = true;
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

    // No pointers down: clear gesture state (taps resolved via DOM handler).
    if (this.dragging) this.dragging = false;
    this.pinching = false;
    this.multiTouch = false;
  }

  /** World point from a raw client position using the canvas's live rect. */
  private worldFromClient(clientX: number, clientY: number) {
    const canvas = this.game.canvas;
    const r = canvas.getBoundingClientRect();
    const bx = (clientX - r.left) * (canvas.width / r.width);
    const by = (clientY - r.top) * (canvas.height / r.height);
    return this.cameras.main.getWorldPoint(bx, by);
  }

  private onCanvasPointerUp(e: PointerEvent) {
    if (UI.isModalOpen()) return;
    if (this.pinching || this.multiTouch) return;
    if (this.moved >= TAP_SLOP) return; // it was a pan, not a tap
    const wp = this.worldFromClient(e.clientX, e.clientY);
    this.ripple(wp.x, wp.y);
    this.handleTileTap(wp.x, wp.y);
  }

  private handleTileTap(wx: number, wy: number) {
    const { col, row } = this.pickTile(wx, wy);
    const { cx, cy } = GameState.chunkOf(col, row);

    // Buyable plot?
    if (GameState.buyableChunks().some((c) => c.cx === cx && c.cy === cy)) {
      UI.promptBuy(cx, cy);
      return;
    }

    const owned = GameState.isOwnedTile(col, row);
    const state = GameState.tileState(col, row);

    if (this.mode === "place") {
      const id = this.selectedDecorId;
      if (!owned) UI.toast("You don't own this land");
      else if (GameState.hasDecor(col, row)) UI.toast("Something's already here");
      else if (state !== "grass") UI.toast("Clear this plot first");
      else if (id && GameState.placeDecor(col, row, id)) {
        this.ripple(this.tileCenter(col, row).x, this.tileCenter(col, row).y);
        Sound.plant();
        if (GameState.inventoryCount(id) <= 0) {
          this.setMode("idle");
          UI.toast("All placed! Buy more in the Shop");
        }
      } else UI.toast("None left in your bag");
      return;
    }
    if (this.mode === "remove") {
      if (GameState.hasDecor(col, row)) {
        GameState.removeDecor(col, row);
        Sound.click();
        UI.toast("📦 Returned to your bag");
      } else UI.toast("Tap a decoration to pick it up");
      return;
    }

    if (this.mode === "hoe") {
      if (owned && state === "grass") this.enqueue({ col, row, action: "till" }, true);
      else UI.toast(owned ? "Already worked here" : "You don't own this land");
      return;
    }
    if (this.mode === "plant") {
      if (owned && state === "soil") this.enqueue({ col, row, action: "plant", cropId: this.selectedCropId }, true);
      else if (owned && state === "grass") UI.toast("🪓 Hoe this tile first");
      else if (owned) UI.toast("Something's already growing");
      else UI.toast("You don't own this land");
      return;
    }

    // idle: harvest ready crop, otherwise just walk there.
    const plot = GameState.getPlot(col, row);
    if (owned && plot && GameState.isReady(plot)) {
      this.enqueue({ col, row, action: "harvest" }, true);
    } else {
      this.replaceWalk(col, row);
      if (plot) UI.toast(`Growing — ${formatTime(GameState.secondsLeft(plot))} left`);
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
    } else {
      this.queue.push(task);
    }
    this.refreshMarkers();
    if (!this.busy) this.processQueue();
  }

  private processQueue() {
    const task = this.queue.shift();
    this.refreshMarkers();
    if (!task) {
      this.busy = false;
      this.stopWorkAnim();
      this.stopWalkAnim();
      GameState.setFarmer(this.farmerTile.col, this.farmerTile.row);
      GameState.save();
      return;
    }
    this.busy = true;
    this.walkTo(task.col, task.row, () => {
      if (task.action === "till") {
        this.workTile(task, () => this.processQueue());
      } else {
        if (task.action !== "walk") this.executeTask(task);
        this.time.delayedCall(task.action === "walk" ? 0 : 140, () => this.processQueue());
      }
    });
  }

  /** Timed ploughing: farmer works the tile for a few seconds with a progress ring. */
  private workTile(task: Task, done: () => void) {
    const ms = Math.max(160, (CONFIG.tillSeconds * 1000) / Math.max(1, GameState.timeScale));
    const c = this.tileCenter(task.col, task.row);
    const cx = c.x;
    const cy = c.y - 26;
    const R = 15;

    this.startWorkAnim();
    const g = this.add.graphics().setDepth(task.col + task.row + 0.8);
    this.workG = g;
    const obj = { p: 0 };
    this.tweens.add({
      targets: obj,
      p: 1,
      duration: ms,
      ease: "Linear",
      onUpdate: () => {
        g.clear();
        g.fillStyle(0x000000, 0.3);
        g.fillCircle(cx, cy, R + 3);
        g.lineStyle(4, 0xffffff, 0.45);
        g.beginPath();
        g.arc(cx, cy, R, 0, Math.PI * 2);
        g.strokePath();
        g.lineStyle(4, 0x8fe04a, 1);
        g.beginPath();
        g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * obj.p);
        g.strokePath();
      },
      onComplete: () => {
        g.destroy();
        if (this.workG === g) this.workG = undefined;
        this.stopWorkAnim();
        if (GameState.till(task.col, task.row)) {
          this.dust(c.x, c.y, 0xb98a55);
          Sound.till();
        }
        done();
      },
    });
  }

  private refreshMarkers() {
    this.markers.forEach((m) => m.destroy());
    this.markers.clear();
    this.queue.forEach((task, i) => {
      if (task.action === "walk") return;
      const c = this.tileCenter(task.col, task.row);
      const icon = task.action === "till" ? "🪓" : task.action === "plant" ? (task.cropId ? CROP_BY_ID[task.cropId].emoji : "🌱") : "🧺";
      const cont = this.add.container(c.x, c.y - 24).setDepth(task.col + task.row + 0.7);
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.18);
      bg.fillCircle(0, 2, 15);
      bg.fillStyle(0xfffdf6, 0.95);
      bg.fillCircle(0, 0, 15);
      const t = this.tx(0, 0, icon, { fontFamily: "Fredoka", fontSize: "18px" }).setOrigin(0.5);
      cont.add([bg, t]);
      cont.setScale(0.9).setAlpha(0.92);
      this.markers.set(`${task.col},${task.row}#${i}`, cont);
      this.tweens.add({ targets: cont, y: c.y - 30, duration: 620, yoyo: true, repeat: -1, ease: "Sine.inOut" });
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

  private startWorkAnim() {
    this.startWalkAnim();
    if (!this.chopTween) {
      this.farmer.setScale(FARMER_SCALE);
      this.chopTween = this.tweens.add({
        targets: this.farmer,
        scaleY: FARMER_SCALE * 0.86,
        duration: 150,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }
  private stopWorkAnim() {
    this.chopTween?.stop();
    this.chopTween = undefined;
    this.farmer.setScale(FARMER_SCALE);
  }

  private executeTask(task: Task) {
    const s = this.tileCenter(task.col, task.row);
    if (task.action === "till") {
      if (GameState.till(task.col, task.row)) this.dust(s.x, s.y, 0xb98a55);
    } else if (task.action === "plant") {
      if (task.cropId && GameState.plant(task.col, task.row, task.cropId)) {
        this.dust(s.x, s.y, 0x6fbf3a);
        this.popCrop(task.col, task.row);
        Sound.plant();
      } else UI.toast("Can't plant there");
    } else if (task.action === "harvest") {
      const plot = GameState.getPlot(task.col, task.row);
      const crop = plot ? CROP_BY_ID[plot.cropId] : undefined;
      const gain = GameState.harvest(task.col, task.row);
      if (gain > 0 && crop) this.harvestFx(task.col, task.row, crop, gain);
    }
  }

  /** Juicy harvest: crop pops up, gold ring, coin burst, shake, big float. */
  private harvestFx(col: number, row: number, crop: { emoji: string }, gain: number) {
    const c = this.tileCenter(col, row);
    this.cameras.main.shake(140, 0.004);

    const fly = this.tx(c.x, c.y + 6, crop.emoji, { fontFamily: "Fredoka", fontSize: "40px" })
      .setOrigin(0.5, 0.85)
      .setDepth(100003);
    this.tweens.add({
      targets: fly,
      y: c.y - 42,
      scale: { from: 1.5, to: 0.5 },
      alpha: { from: 1, to: 0 },
      duration: 620,
      ease: "Cubic.out",
      onComplete: () => fly.destroy(),
    });

    const ring = this.add.circle(c.x, c.y, 14, 0xffd34d, 0).setStrokeStyle(4, 0xffd34d, 0.9).setDepth(100003);
    this.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 440, ease: "Cubic.out", onComplete: () => ring.destroy() });

    this.coinBurst(c.x, c.y);
    this.floatWorld(c.x, c.y - 8, `+${gain}🪙`);
    Sound.harvest();
  }

  private popCrop(col: number, row: number) {
    const v = this.soil.get(this.key(col, row));
    if (!v) return;
    v.crop.setVisible(true).setTexture("sprout-cluster");
    this.tweens.add({
      targets: v.crop,
      scaleX: { from: TILE_SCALE * 0.15, to: TILE_SCALE * 0.6 },
      scaleY: { from: TILE_SCALE * 0.15, to: TILE_SCALE * 0.6 },
      duration: 260,
      ease: "Back.out",
    });
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
      speed: { min: 110, max: 300 }, angle: { min: 190, max: 350 }, gravityY: 560,
      scale: { start: 1.0 / SS, end: 0 }, tint: [0xffe169, 0xffc83d, 0xfff4c2, 0xffffff], lifespan: 720, quantity: 22, emitting: false,
    });
    e.setDepth(100002);
    e.explode(22);
    this.time.delayedCall(900, () => e.destroy());
  }

  // ---- Targets / crop animation -------------------------------------
  /** Highlight the tiles the current tool can act on. */
  private refreshTargets() {
    this.targets.forEach((t) => t.destroy());
    this.targets = [];
    if (this.mode === "idle") return;
    for (const ownedKey of Object.keys(GameState.data.owned)) {
      const [cx, cy] = ownedKey.split(",").map(Number);
      for (let r = 0; r < CS; r++) {
        for (let c = 0; c < CS; c++) {
          const col = cx * CS + c;
          const row = cy * CS + r;
          const st = GameState.tileState(col, row);
          const decor = GameState.hasDecor(col, row);
          const valid =
            this.mode === "hoe" ? st === "grass" && !decor
            : this.mode === "plant" ? st === "soil"
            : this.mode === "place" ? st === "grass" && !decor
            : this.mode === "remove" ? decor
            : false;
          if (!valid) continue;
          const p = this.tilePos(col, row);
          const img = this.add.image(p.x, p.y, "tile-target").setOrigin(0.5, 0).setScale(TILE_SCALE).setDepth(col + row + 0.4);
          this.targets.push(img);
        }
      }
    }
  }

  private animateTargets() {
    if (!this.targets.length) return;
    const a = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(this.time.now / 280));
    for (const t of this.targets) t.setAlpha(a);
  }

  /** Quick expanding ring at a tapped world point. */
  private ripple(x: number, y: number) {
    const c = this.add.circle(x, y, 10, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0.85).setDepth(100004);
    this.tweens.add({ targets: c, scale: 3, alpha: 0, duration: 360, ease: "Cubic.out", onComplete: () => c.destroy() });
  }

  private animateCrops() {
    for (const [key, v] of this.soil) {
      const [col, row] = key.split(",").map(Number);
      const plot = GameState.getPlot(col, row);
      if (!plot) {
        if (v.crop.visible) {
          v.crop.setVisible(false);
          v.bar.clear();
          v.readyTween?.stop();
          v.readyTween = undefined;
        }
        continue;
      }
      const crop = CROP_BY_ID[plot.cropId];
      if (!crop) continue;
      const ratio = GameState.growthRatio(plot);
      const wantTex = ratio < 0.25 ? "sprout-cluster" : ratio < 0.8 ? `crop-${crop.id}-leaf` : `crop-${crop.id}`;
      if (v.crop.texture.key !== wantTex) v.crop.setTexture(wantTex);
      v.crop.setVisible(true);

      if (ratio >= 1) {
        v.bar.clear();
        if (!v.readyTween) {
          v.crop.setScale(TILE_SCALE);
          v.readyTween = this.tweens.add({
            targets: v.crop,
            scaleX: { from: TILE_SCALE, to: TILE_SCALE * 1.05 },
            scaleY: { from: TILE_SCALE, to: TILE_SCALE * 1.05 },
            duration: 560,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });
        }
      } else if (!this.tweens.isTweening(v.crop)) {
        const grow = ratio < 0.3 ? 0.5 + ratio : 0.64 + 0.36 * ratio;
        v.crop.setScale(TILE_SCALE * grow);
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
    const t = this.tx(x, y, text, { fontFamily: "Fredoka", fontSize: "26px", fontStyle: "700", color: "#ffe169" })
      .setOrigin(0.5)
      .setDepth(100003);
    t.setStroke("#5a3a1a", 6);
    this.tweens.add({ targets: t, scale: { from: 0.4, to: 1.15 }, duration: 220, ease: "Back.out" });
    this.tweens.add({ targets: t, y: y - 58, alpha: { from: 1, to: 0 }, delay: 180, duration: 760, ease: "Cubic.out", onComplete: () => t.destroy() });
  }

  /** Public: queue the farmer to harvest every ready crop, nearest first. */
  harvestAll() {
    const ready: { col: number; row: number; d: number }[] = [];
    for (const key of Object.keys(GameState.data.plots)) {
      const [col, row] = key.split(",").map(Number);
      if (!GameState.isReady(GameState.data.plots[key])) continue;
      const c = this.tileCenter(col, row);
      ready.push({ col, row, d: Phaser.Math.Distance.Between(this.farmer.x, this.farmer.y, c.x, c.y) });
    }
    if (!ready.length) {
      UI.toast("No crops are ready yet");
      return;
    }
    ready.sort((a, b) => a.d - b.d);
    for (const r of ready) this.enqueue({ col: r.col, row: r.row, action: "harvest" }, true);
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
    if (ready > 0) UI.toast(`🌾 ${ready} crop${ready > 1 ? "s" : ""} ready to harvest!`);
  }
}

export function formatTime(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}
