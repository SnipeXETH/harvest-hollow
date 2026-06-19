import Phaser from "phaser";
import { CONFIG } from "../config";
import { CROPS } from "../data/crops";
import { DECOR } from "../data/decorations";
import { DPR } from "../scenes/BaseScene";

const W = CONFIG.tileWidth;
const H = CONFIG.tileHeight;
// Supersample textures so they stay sharp under the device-pixel camera zoom.
export const SS = Math.min(Math.max(Math.ceil(DPR), 1), 3);

// A filled crop tile bakes several crop icons into one texture so a planted
// tile looks densely packed. Plants stick up above the tile diamond.
const CTOP = 38; // plant height above the diamond, in design px
export const CROP_TEX = {
  tw: W,
  th: H + CTOP,
  // Origin at the diamond centre so the image sits on a tile and scales from it.
  centerOriginY: (CTOP + H / 2) / (H + CTOP),
};

function diamond(g: Phaser.GameObjects.Graphics, s: number, fill: number, fillAlpha = 1, line?: { c: number; a: number; w: number }) {
  const w = W * s;
  const h = H * s;
  g.fillStyle(fill, fillAlpha);
  if (line) g.lineStyle(line.w * s, line.c, line.a);
  g.beginPath();
  g.moveTo(w / 2, 0);
  g.lineTo(w, h / 2);
  g.lineTo(w / 2, h);
  g.lineTo(0, h / 2);
  g.closePath();
  g.fillPath();
  if (line) g.strokePath();
}

export function generateTextures(scene: Phaser.Scene): void {
  const s = SS;

  const bakeTile = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, W * s, H * s);
    g.destroy();
  };

  bakeTile("tile-grass", (g) => grassTile(g, s, 0x7ec24a, 0));
  bakeTile("tile-grass-2", (g) => grassTile(g, s, 0x84c84e, 1));
  if (scene.textures.exists("dirt-src")) {
    // Real dirt texture, diamond-cropped, with plowed furrows drawn on top.
    texturedDiamond(scene, "tile-soil", "dirt-src", s, (g) => soilFurrows(g, s));
  } else {
    bakeTile("tile-soil", (g) => soilTile(g, s));
  }
  // Buyable plot highlight tile.
  bakeTile("tile-buy", (g) => diamond(g, s, 0xffe27a, 0.28, { c: 0xfff0b8, a: 0.9, w: 2 }));
  // Target highlight (valid action / tap feedback).
  bakeTile("tile-target", (g) => diamond(g, s, 0xffffff, 0.16, { c: 0xffffff, a: 0.95, w: 3 }));

  // Farmer character — two walk frames.
  drawFarmer(scene, "farmer-0", s, 0);
  drawFarmer(scene, "farmer-1", s, 1);

  // Dense crop clusters (one texture per crop + a sprout cluster).
  bakeCrops(scene, s);

  // Decoration icons (one standing emoji texture per decoration).
  bakeDecor(scene, s);

  // Soft round particle.
  {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8 * s, 8 * s, 8 * s);
    g.generateTexture("spark", 16 * s, 16 * s);
    g.destroy();
  }
}

type Arch = "leafy" | "grain" | "fruit";
const CROP_ARCH: Record<string, Arch> = {
  carrot: "leafy", potato: "leafy", wheat: "grain", corn: "grain",
  strawberry: "fruit", tomato: "fruit", melon: "fruit", pumpkin: "fruit", grapes: "fruit",
};

// Plant base points filling the diamond (design px, relative to diamond centre).
function fieldPoints(): [number, number][] {
  const pts: [number, number][] = [];
  for (let gy = -2; gy <= 2; gy++) {
    for (let gx = -3; gx <= 3; gx++) {
      const ox = gx * 16 + (gy & 1 ? 8 : 0);
      const oy = gy * 10;
      if (Math.abs(ox) / 52 + Math.abs(oy) / 24 <= 0.96) pts.push([ox, oy]);
    }
  }
  return pts.sort((a, b) => a[1] - b[1]); // back (higher up) first
}

function drawPlant(g: Phaser.GameObjects.Graphics, s: number, x: number, y: number, color: number, arch: Arch, ripe: boolean) {
  const X = (v: number) => v * s;
  const leafDk = 0x3f8a34;
  const leafLt = 0x6abf45;

  if (arch === "grain") {
    for (const dx of [-3, 0, 3]) {
      g.lineStyle(2.2 * s, ripe ? 0xbf952f : 0x5a9a38, 1);
      g.beginPath();
      g.moveTo(X(x + dx), X(y));
      g.lineTo(X(x + dx * 1.5), X(y - 16));
      g.strokePath();
      if (ripe) {
        g.fillStyle(color, 1);
        g.fillEllipse(X(x + dx * 1.5), X(y - 17), 4.5 * s, 8 * s);
      }
    }
    return;
  }

  // leafy bush base
  g.fillStyle(leafDk, 1);
  g.fillEllipse(X(x - 4), X(y - 6), 8 * s, 14 * s);
  g.fillEllipse(X(x + 4), X(y - 6), 8 * s, 14 * s);
  g.fillStyle(leafLt, 1);
  g.fillEllipse(X(x), X(y - 8), 8 * s, 16 * s);
  if (!ripe) return;

  if (arch === "fruit") {
    g.fillStyle(color, 1);
    g.fillCircle(X(x), X(y - 4), 5 * s);
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(X(x - 1.6), X(y - 5.6), 1.6 * s);
  } else {
    // leafy-root: a peek of the crop colour at the base
    g.fillStyle(color, 1);
    g.fillEllipse(X(x), X(y - 1), 7 * s, 6 * s);
  }
}

function drawSprout(g: Phaser.GameObjects.Graphics, s: number, x: number, y: number) {
  const X = (v: number) => v * s;
  g.lineStyle(2 * s, 0x69bf42, 1);
  g.beginPath();
  g.moveTo(X(x), X(y));
  g.lineTo(X(x - 3), X(y - 6));
  g.moveTo(X(x), X(y));
  g.lineTo(X(x + 3), X(y - 6));
  g.strokePath();
}

function bakeCrops(scene: Phaser.Scene, s: number) {
  const tw = CROP_TEX.tw;
  const th = CROP_TEX.th;
  const cx = tw / 2;
  const cy = CTOP + H / 2;
  const pts = fieldPoints();

  const bake = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, tw * s, th * s);
    g.destroy();
  };

  for (const c of CROPS) {
    const arch = CROP_ARCH[c.id] || "fruit";
    bake(`crop-${c.id}`, (g) => pts.forEach(([ox, oy]) => drawPlant(g, s, cx + ox, cy + oy, c.color, arch, true)));
    bake(`crop-${c.id}-leaf`, (g) => pts.forEach(([ox, oy]) => drawPlant(g, s, cx + ox, cy + oy, c.color, arch, false)));
  }
  bake("sprout-cluster", (g) => pts.forEach(([ox, oy]) => drawSprout(g, s, cx + ox, cy + oy)));
}

function grassTile(g: Phaser.GameObjects.Graphics, s: number, base: number, variant: number) {
  diamond(g, s, base);
  // soft upper sheen
  g.fillStyle(0xffffff, 0.07);
  g.beginPath();
  g.moveTo((W / 2) * s, 0);
  g.lineTo(W * s, (H / 2) * s);
  g.lineTo(0, (H / 2) * s);
  g.closePath();
  g.fillPath();
  // scattered grass tufts
  const tufts: [number, number][] =
    variant === 0
      ? [[34, 22], [62, 30], [80, 22], [22, 32], [54, 40], [88, 38], [44, 16], [70, 44]]
      : [[28, 26], [50, 18], [74, 28], [40, 38], [66, 40], [86, 30], [20, 24], [58, 46]];
  for (const [px, py] of tufts) {
    g.lineStyle(1.5 * s, 0x5fa838, 0.9);
    for (const dx of [-2.4, 0, 2.4]) {
      g.beginPath();
      g.moveTo(px * s, py * s);
      g.lineTo((px + dx) * s, (py - 5) * s);
      g.strokePath();
    }
  }
}

function soilFurrows(g: Phaser.GameObjects.Graphics, s: number) {
  // plowed rows: 4 parallel furrows fully inside the diamond
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const ax = 55 * t, ay = 27.5 * (1 - t);
    const bx = 55 + 55 * t, by = 55 - 27.5 * t;
    g.lineStyle(2 * s, 0xc08a4e, 0.6); // ridge highlight
    g.beginPath();
    g.moveTo(ax * s, (ay - 2) * s);
    g.lineTo(bx * s, (by - 2) * s);
    g.strokePath();
    g.lineStyle(2 * s, 0x5b3415, 0.5); // furrow shadow
    g.beginPath();
    g.moveTo(ax * s, ay * s);
    g.lineTo(bx * s, by * s);
    g.strokePath();
  }
}

function soilTile(g: Phaser.GameObjects.Graphics, s: number) {
  diamond(g, s, 0x9b5e34, 1, { c: 0x6f3f20, a: 0.5, w: 2 });
  soilFurrows(g, s);
}

/** Bake a square source image cropped to an isometric diamond, + optional overlay. */
function texturedDiamond(
  scene: Phaser.Scene,
  key: string,
  srcKey: string,
  s: number,
  overlay?: (g: Phaser.GameObjects.Graphics) => void
) {
  const w = W * s;
  const h = H * s;
  const rt = scene.add.renderTexture(0, 0, w, h).setVisible(false);
  const img = scene.make.image({ x: 0, y: 0, key: srcKey, add: false }).setOrigin(0, 0);
  img.setDisplaySize(w, h);
  rt.draw(img);
  // Erase the four corners outside the diamond.
  const er = scene.make.graphics({ x: 0, y: 0 }, false);
  er.fillStyle(0xffffff, 1);
  er.fillTriangle(0, 0, w / 2, 0, 0, h / 2);
  er.fillTriangle(w / 2, 0, w, 0, w, h / 2);
  er.fillTriangle(w, h / 2, w, h, w / 2, h);
  er.fillTriangle(0, h / 2, 0, h, w / 2, h);
  rt.erase(er);
  if (overlay) {
    const og = scene.make.graphics({ x: 0, y: 0 }, false);
    overlay(og);
    rt.draw(og);
    og.destroy();
  }
  // subtle edge for definition
  const edge = scene.make.graphics({ x: 0, y: 0 }, false);
  edge.lineStyle(2 * s, 0x5b3415, 0.4);
  edge.beginPath();
  edge.moveTo(w / 2, 0);
  edge.lineTo(w, h / 2);
  edge.lineTo(w / 2, h);
  edge.lineTo(0, h / 2);
  edge.closePath();
  edge.strokePath();
  rt.draw(edge);
  rt.saveTexture(key);
  img.destroy();
  er.destroy();
  edge.destroy();
}

export const DECOR_TEX = { tw: 68, th: 74 };

function bakeDecor(scene: Phaser.Scene, s: number) {
  const { tw, th } = DECOR_TEX;
  for (const d of DECOR) {
    const rt = scene.add.renderTexture(0, 0, tw * s, th * s).setVisible(false);
    const t = scene.add.text(0, 0, d.emoji, { fontSize: `${46 * s}px` }).setOrigin(0.5, 1);
    rt.draw(t, (tw / 2) * s, (th - 4) * s);
    t.destroy();
    rt.saveTexture(`decor-${d.id}`);
  }
}

function drawFarmer(scene: Phaser.Scene, key: string, s: number, frame: number) {
  const BW = 34;
  const BH = 54;
  const g = scene.add.graphics();
  const X = (v: number) => v * s;

  const blue = 0x3d6fb4;
  const blueDk = 0x335f9c;
  const boot = 0x4a3322;
  const skin = 0xf1c27d;
  const hat = 0xdcb45c;
  const hatDk = 0x8a5a2b;

  // Legs (spread on walk frame).
  const lx1 = frame === 0 ? 10 : 7;
  const lx2 = frame === 0 ? 18 : 21;
  g.fillStyle(blueDk, 1);
  g.fillRoundedRect(X(lx1), X(34), X(6), X(15), X(2));
  g.fillRoundedRect(X(lx2), X(34), X(6), X(15), X(2));
  g.fillStyle(boot, 1);
  g.fillRoundedRect(X(lx1 - 0.5), X(46), X(7), X(6), X(2));
  g.fillRoundedRect(X(lx2 - 0.5), X(46), X(7), X(6), X(2));

  // Arms.
  g.fillStyle(skin, 1);
  g.fillRoundedRect(X(4), X(21), X(4.5), X(12), X(2));
  g.fillRoundedRect(X(25.5), X(21), X(4.5), X(12), X(2));

  // Overalls torso.
  g.fillStyle(blue, 1);
  g.fillRoundedRect(X(7.5), X(21), X(19), X(17), X(5));
  // Straps.
  g.fillRoundedRect(X(11.5), X(15), X(3), X(9), X(1.5));
  g.fillRoundedRect(X(19), X(15), X(3), X(9), X(1.5));

  // Head.
  g.fillStyle(skin, 1);
  g.fillCircle(X(17), X(13), X(6.2));

  // Straw hat.
  g.fillStyle(hat, 1);
  g.fillEllipse(X(17), X(9), X(23), X(8));
  g.beginPath();
  g.arc(X(17), X(9), X(6.4), Math.PI, 0);
  g.closePath();
  g.fillPath();
  g.fillStyle(hatDk, 1);
  g.fillRect(X(10.6), X(7), X(12.8), X(2.2));

  g.generateTexture(key, BW * s, BH * s);
  g.destroy();
}
