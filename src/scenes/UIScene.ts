import Phaser from "phaser";
import { GameState } from "../state/GameState";
import { CONFIG } from "../config";
import { CROPS, CROP_BY_ID } from "../data/crops";
import { levelProgress } from "../data/levels";
import { formatTime } from "./FarmScene";
import type { FarmScene, Mode } from "./FarmScene";
import { BaseScene } from "./BaseScene";
import { FONT, COLORS, hex } from "../theme";

const BADGE = { r: 16, ring: 22 };
const HUD_BAND = 116; // CSS px reserved at top
const BAR_BAND = 88; // CSS px reserved at bottom

interface ToolButton {
  setActive: (on: boolean) => void;
  setGlyph: (emoji: string) => void;
}

export class UIScene extends BaseScene {
  private farm!: FarmScene;

  private coinsText!: Phaser.GameObjects.Text;
  private gemsText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private xpRing!: Phaser.GameObjects.Graphics;
  private badgeCx = 0;
  private badgeCy = 0;

  private ffG!: Phaser.GameObjects.Graphics;
  private ffText!: Phaser.GameObjects.Text;
  private ffCx = 0;
  private ffCy = 0;

  private hoeBtn!: ToolButton;
  private plantBtn!: ToolButton;
  private hint?: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;

  constructor() {
    super("UIScene");
  }

  create() {
    this.applyHiDPI();
    this.farm = this.scene.get("FarmScene") as FarmScene;

    this.buildHud();
    this.buildToolbar();

    GameState.on("wallet", () => this.refreshHud(), this);
    GameState.on("xp", () => this.refreshHud(), this);
    GameState.on("owned", () => this.refreshHud(), this);
    GameState.on("levelup", (lvl: number) => this.toast(`⭐ Level ${lvl}! New seeds may be unlocked`), this);

    this.farm.events.on("mode", (m: Mode, cropId?: string) => this.onMode(m, cropId));

    this.scale.on("resize", () => this.relayout(), this);
    this.refreshHud();

    const loader = document.getElementById("loading");
    if (loader) {
      loader.style.opacity = "0";
      setTimeout(() => loader.remove(), 500);
    }
  }

  isModalOpen(): boolean {
    return !!this.modal;
  }

  /** True if a tap at these CSS coords should NOT reach the world. */
  blocksWorldInput(_x: number, y: number): boolean {
    if (this.modal) return true;
    if (y < HUD_BAND) return true;
    if (y > this.vh - BAR_BAND) return true;
    return false;
  }

  // ---- Drawing helpers ----------------------------------------------
  private card(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius: number, fill: number, shadow = true) {
    if (shadow) {
      g.fillStyle(COLORS.shadow, 0.12);
      g.fillRoundedRect(x, y + 4, w, h, radius);
    }
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, y, w, h, radius);
    g.fillStyle(0xffffff, 0.45);
    g.fillRoundedRect(x + 3, y + 3, w - 6, h * 0.36, { tl: radius - 4, tr: radius - 4, bl: 0, br: 0 });
  }

  private pillButton(cx: number, cy: number, w: number, h: number, fill: number, fillDark: number, label: string, textColor: string, onTap: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    const r = h / 2;
    g.fillStyle(fillDark, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.42, { tl: r, tr: r, bl: 0, br: 0 });
    const t = this.tx(0, -1, label, { fontFamily: FONT, fontSize: "19px", fontStyle: "600", color: textColor }).setOrigin(0.5);
    c.add([g, t]);
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on("pointerdown", () => {
      this.tweens.add({ targets: c, scaleX: { from: 0.92, to: 1 }, scaleY: { from: 0.92, to: 1 }, duration: 160, ease: "Back.out" });
      onTap();
    });
    return c;
  }

  private toolButton(cx: number, cy: number, emoji: string, label: string, onTap: () => void): ToolButton {
    const w = 100;
    const h = 58;
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    const glyph = this.tx(0, -9, emoji, { fontFamily: FONT, fontSize: "27px" }).setOrigin(0.5);
    const lbl = this.tx(0, 18, label, { fontFamily: FONT, fontSize: "13px", fontStyle: "600", color: COLORS.ink }).setOrigin(0.5);
    c.add([g, glyph, lbl]);
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    const draw = (active: boolean) => {
      g.clear();
      g.fillStyle(COLORS.shadow, 0.12);
      g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 16);
      g.fillStyle(active ? COLORS.green : COLORS.cream, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
      g.fillStyle(0xffffff, active ? 0.18 : 0.4);
      g.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.34, { tl: 13, tr: 13, bl: 0, br: 0 });
      lbl.setColor(active ? "#ffffff" : COLORS.ink);
    };
    draw(false);
    c.on("pointerdown", () => {
      this.tweens.add({ targets: c, scaleX: { from: 0.92, to: 1 }, scaleY: { from: 0.92, to: 1 }, duration: 150, ease: "Back.out" });
      onTap();
    });
    return { setActive: draw, setGlyph: (e) => glyph.setText(e) };
  }

  private chip(cx: number, cy: number, emoji: string, onTap: () => void) {
    const g = this.add.graphics();
    g.fillStyle(COLORS.shadow, 0.12);
    g.fillCircle(cx, cy + 3, 19);
    g.fillStyle(COLORS.cream, 1);
    g.fillCircle(cx, cy, 19);
    this.tx(cx, cy, emoji, { fontFamily: FONT, fontSize: "18px" }).setOrigin(0.5);
    const z = this.add.circle(cx, cy, 21).setInteractive({ useHandCursor: true });
    z.on("pointerdown", onTap);
  }

  // ---- HUD -----------------------------------------------------------
  private buildHud() {
    const w = this.vw;
    const g = this.add.graphics();
    this.card(g, 10, 12, w - 20, 56, 18, COLORS.cream);

    this.tx(24, 40, "🪙", { fontFamily: FONT, fontSize: "22px" }).setOrigin(0, 0.5);
    this.coinsText = this.tx(50, 39, "", { fontFamily: FONT, fontSize: "21px", fontStyle: "600", color: COLORS.ink }).setOrigin(0, 0.5);

    this.tx(w * 0.46, 40, "💎", { fontFamily: FONT, fontSize: "20px" }).setOrigin(0, 0.5);
    this.gemsText = this.tx(w * 0.46 + 26, 39, "", { fontFamily: FONT, fontSize: "20px", fontStyle: "600", color: hex(COLORS.blue) }).setOrigin(0, 0.5);

    this.badgeCx = w - 40;
    this.badgeCy = 40;
    g.lineStyle(3, 0xffffff, 1);
    g.fillStyle(COLORS.green, 1);
    g.fillCircle(this.badgeCx, this.badgeCy, BADGE.r);
    g.strokeCircle(this.badgeCx, this.badgeCy, BADGE.r);
    this.xpRing = this.add.graphics();
    this.levelText = this.tx(this.badgeCx, this.badgeCy - 1, "1", { fontFamily: FONT, fontSize: "18px", fontStyle: "700", color: "#ffffff" }).setOrigin(0.5);

    // Right-side chips: recenter + dev fast-forward.
    this.chip(w - 30, 92, "🎯", () => this.farm.recenterView());
    this.ffCx = w - 74;
    this.ffCy = 92;
    this.ffG = this.add.graphics();
    this.ffText = this.tx(this.ffCx, this.ffCy, "1×", { fontFamily: FONT, fontSize: "13px", fontStyle: "700", color: COLORS.ink }).setOrigin(0.5);
    const z = this.add.circle(this.ffCx, this.ffCy, 19).setInteractive({ useHandCursor: true });
    z.on("pointerdown", () => this.cycleTimeScale());
    this.drawFf();
  }

  private refreshHud() {
    this.coinsText.setText(GameState.coins.toLocaleString());
    this.gemsText.setText(`${GameState.gems}`);
    const p = levelProgress(GameState.xp);
    this.levelText.setText(`${p.level}`);
    const g = this.xpRing;
    g.clear();
    g.lineStyle(4, COLORS.xpTrack, 1);
    g.beginPath();
    g.arc(this.badgeCx, this.badgeCy, BADGE.ring, 0, Math.PI * 2);
    g.strokePath();
    if (p.ratio > 0) {
      g.lineStyle(4, COLORS.gold, 1);
      g.beginPath();
      g.arc(this.badgeCx, this.badgeCy, BADGE.ring, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.ratio);
      g.strokePath();
    }
  }

  private drawFf() {
    const active = GameState.timeScale !== 1;
    this.ffG.clear();
    this.ffG.fillStyle(COLORS.shadow, 0.12);
    this.ffG.fillCircle(this.ffCx, this.ffCy + 3, 19);
    this.ffG.fillStyle(active ? COLORS.green : COLORS.cream, 1);
    this.ffG.fillCircle(this.ffCx, this.ffCy, 19);
    this.ffText.setColor(active ? "#ffffff" : COLORS.ink);
  }

  private cycleTimeScale() {
    const scales = [1, 60, 600];
    const next = scales[(scales.indexOf(GameState.timeScale) + 1) % scales.length];
    GameState.setTimeScale(next);
    this.ffText.setText(`${next}×`);
    this.drawFf();
    this.toast(next === 1 ? "Real-time growth" : `Dev speed: ${next}×`);
  }

  // ---- Toolbar -------------------------------------------------------
  private buildToolbar() {
    const width = this.vw;
    const height = this.vh;
    const y = height - 44;
    const cxs = [width / 2 - 126, width / 2, width / 2 + 126];
    this.hoeBtn = this.toolButton(cxs[0], y, "🪓", "Hoe", () => this.farm.setMode(this.farm.mode === "hoe" ? "idle" : "hoe"));
    this.plantBtn = this.toolButton(cxs[1], y, "🌱", "Seeds", () => this.openSeedPicker());
    this.toolButton(cxs[2], y, "🛒", "Shop", () => this.openShop());
    this.onMode(this.farm.mode, this.farm.selectedCropId);
  }

  private onMode(mode: Mode, cropId?: string) {
    this.hoeBtn.setActive(mode === "hoe");
    this.plantBtn.setActive(mode === "plant");
    this.plantBtn.setGlyph(mode === "plant" && cropId ? CROP_BY_ID[cropId].emoji : "🌱");
    if (mode === "hoe") this.showHint("🪓 Tap your grass to till it into soil");
    else if (mode === "plant" && cropId) this.showHint(`🌱 Planting ${CROP_BY_ID[cropId].name} — tap a soil plot`);
    else this.hideHint();
  }

  private showHint(text: string) {
    this.hideHint();
    const width = this.vw;
    const height = this.vh;
    const c = this.add.container(0, 0).setDepth(400);
    const t = this.tx(0, 0, text, { fontFamily: FONT, fontSize: "15px", fontStyle: "600", color: COLORS.ink }).setOrigin(0, 0.5);
    const pad = 16;
    const closeW = 26;
    const w = pad + t.width + 12 + closeW + pad;
    const x = width / 2 - w / 2;
    const y = height - BAR_BAND - 18;
    const g = this.add.graphics();
    g.fillStyle(COLORS.shadow, 0.14);
    g.fillRoundedRect(x, y - 18 + 3, w, 36, 18);
    g.fillStyle(COLORS.cream, 1);
    g.fillRoundedRect(x, y - 18, w, 36, 18);
    t.setPosition(x + pad, y);
    const ccx = x + w - pad - closeW / 2;
    const cg = this.add.graphics();
    cg.fillStyle(0xe7ddc8, 1);
    cg.fillCircle(ccx, y, 12);
    const cx2 = this.tx(ccx, y - 1, "✕", { fontFamily: FONT, fontSize: "14px", fontStyle: "700", color: COLORS.ink }).setOrigin(0.5);
    const z = this.add.circle(ccx, y, 16).setInteractive({ useHandCursor: true });
    z.on("pointerdown", () => this.farm.setMode("idle"));
    c.add([g, t, cg, cx2, z]);
    this.hint = c;
    this.tweens.add({ targets: c, y: { from: 12, to: 0 }, alpha: { from: 0.5, to: 1 }, duration: 180 });
  }
  private hideHint() {
    this.hint?.destroy();
    this.hint = undefined;
  }

  // ---- Modals --------------------------------------------------------
  private openModal(heightFrac = 0.5): { c: Phaser.GameObjects.Container; sheetY: number; width: number } {
    this.closeModal();
    const width = this.vw;
    const height = this.vh;
    const c = this.add.container(0, 0).setDepth(500);
    const scrim = this.add.rectangle(0, 0, width, height, 0x000000, 0.42).setOrigin(0).setInteractive();
    scrim.on("pointerdown", () => this.closeModal());
    const sheetH = height * heightFrac;
    const sheetY = height - sheetH;
    const g = this.add.graphics();
    g.fillStyle(COLORS.shadow, 0.18);
    g.fillRoundedRect(0, sheetY - 4, width, sheetH + 44, { tl: 28, tr: 28, bl: 0, br: 0 });
    g.fillStyle(COLORS.cream, 1);
    g.fillRoundedRect(0, sheetY, width, sheetH + 40, { tl: 28, tr: 28, bl: 0, br: 0 });
    g.fillStyle(0xd8cdb6, 1);
    g.fillRoundedRect(width / 2 - 22, sheetY + 12, 44, 5, 3);
    const block = this.add.zone(0, sheetY, width, sheetH + 40).setOrigin(0).setInteractive();
    block.on("pointerdown", () => {});
    c.add([scrim, g, block]);
    this.modal = c;
    this.tweens.add({ targets: c, y: { from: sheetH * 0.6, to: 0 }, alpha: { from: 0.4, to: 1 }, duration: 240, ease: "Cubic.out" });
    return { c, sheetY, width };
  }
  private closeModal() {
    this.modal?.destroy();
    this.modal = undefined;
  }
  private sheetTitle(c: Phaser.GameObjects.Container, sheetY: number, width: number, text: string) {
    c.add(this.tx(width / 2, sheetY + 30, text, { fontFamily: FONT, fontSize: "24px", fontStyle: "700", color: COLORS.ink }).setOrigin(0.5, 0));
  }

  openSeedPicker() {
    const { c, sheetY, width } = this.openModal(0.62);
    this.sheetTitle(c, sheetY, width, "Choose a seed");
    let y = sheetY + 78;
    const level = GameState.level;
    for (const crop of CROPS) {
      const unlocked = level >= crop.unlockLevel;
      const g = this.add.graphics();
      g.fillStyle(unlocked ? COLORS.rowBg : COLORS.rowBgLocked, 1);
      g.fillRoundedRect(20, y, width - 40, 66, 16);
      c.add(g);
      c.add(this.tx(40, y + 16, crop.emoji, { fontFamily: FONT, fontSize: "36px" }));
      c.add(this.tx(92, y + 12, crop.name, { fontFamily: FONT, fontSize: "20px", fontStyle: "600", color: unlocked ? COLORS.ink : hex(COLORS.lock) }));
      c.add(this.tx(92, y + 40, `⏱ ${formatTime(crop.growSeconds)}   🪙 ${crop.seedCost} → ${crop.sellPrice}`, { fontFamily: FONT, fontSize: "14px", color: COLORS.inkSoft }));
      if (!unlocked) {
        c.add(this.tx(width - 36, y + 33, `🔒 Lvl ${crop.unlockLevel}`, { fontFamily: FONT, fontSize: "15px", fontStyle: "500", color: hex(COLORS.lock) }).setOrigin(1, 0.5));
      } else {
        const bw = 96, bx = width - 28 - bw, by = y + 17, bh = 32;
        const btn = this.add.graphics();
        btn.fillStyle(COLORS.greenDark, 1);
        btn.fillRoundedRect(bx, by + 3, bw, bh, 11);
        btn.fillStyle(COLORS.green, 1);
        btn.fillRoundedRect(bx, by, bw, bh, 11);
        c.add(btn);
        c.add(this.tx(bx + bw / 2, by + bh / 2, "Select", { fontFamily: FONT, fontSize: "16px", fontStyle: "600", color: "#ffffff" }).setOrigin(0.5));
        const z = this.add.zone(bx, by, bw, bh).setOrigin(0).setInteractive({ useHandCursor: true });
        z.on("pointerdown", () => { this.farm.setMode("plant", crop.id); this.closeModal(); });
        c.add(z);
      }
      y += 76;
    }
  }

  promptBuy(cx: number, cy: number) {
    const cost = GameState.plotCost();
    const { c, sheetY, width } = this.openModal(0.36);
    this.sheetTitle(c, sheetY, width, "Buy this plot");
    c.add(this.tx(width / 2, sheetY + 74, `Claim a ${CONFIG.chunkSize}×${CONFIG.chunkSize} patch of land`, { fontFamily: FONT, fontSize: "17px", color: COLORS.ink }).setOrigin(0.5, 0));
    const canBuy = GameState.canAfford(cost);
    c.add(this.pillButton(width / 2, sheetY + 140, 230, 52, canBuy ? COLORS.green : COLORS.lock, canBuy ? COLORS.greenDark : COLORS.lock, canBuy ? `Buy plot  🪙${cost.toLocaleString()}` : `Need 🪙${cost.toLocaleString()}`, "#ffffff", () => {
      if (GameState.buyChunk(cx, cy)) {
        this.closeModal();
        this.toast("🎉 New land claimed!");
      }
    }));
  }

  openShop() {
    const { c, sheetY, width } = this.openModal(0.42);
    this.sheetTitle(c, sheetY, width, "Shop");
    c.add(this.tx(width / 2, sheetY + 84, "🪓 Hoe grass into soil, 🌱 plant seeds,\nthen tap ripe crops to harvest.\n\nTap a glowing plot at the edge of your\nfarm to buy more land!\n\n💎 Premium shop coming soon.", { fontFamily: FONT, fontSize: "16px", color: COLORS.inkSoft, align: "center", lineSpacing: 7 }).setOrigin(0.5, 0));
  }

  // ---- Transient feedback -------------------------------------------
  toast(message: string) {
    const width = this.vw;
    const height = this.vh;
    const t = this.tx(width / 2, height * 0.2, message, { fontFamily: FONT, fontSize: "16px", fontStyle: "600", color: "#ffffff", backgroundColor: "#000000aa", padding: { x: 16, y: 9 } }).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: { from: 1, to: 0 }, delay: 1200, duration: 650, onComplete: () => t.destroy() });
  }

  private relayout() {
    this.applyHiDPI();
    this.children.removeAll(true);
    this.modal = undefined;
    this.hint = undefined;
    this.buildHud();
    this.buildToolbar();
    this.refreshHud();
  }
}
