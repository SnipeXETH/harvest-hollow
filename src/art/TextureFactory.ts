import Phaser from "phaser";
import { CONFIG } from "../config";
import { DPR } from "../scenes/BaseScene";

const W = CONFIG.tileWidth;
const H = CONFIG.tileHeight;
// Supersample textures so they stay sharp under the device-pixel camera zoom.
export const SS = Math.min(Math.max(Math.ceil(DPR), 1), 3);

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

  bakeTile("tile-grass", (g) => diamond(g, s, 0x7ec24a));
  bakeTile("tile-grass-2", (g) => diamond(g, s, 0x86c953));
  bakeTile("tile-soil", (g) => {
    diamond(g, s, 0x9b5e34, 1, { c: 0x6f3f20, a: 0.55, w: 2 });
    g.fillStyle(0xa86a3c, 0.5);
    g.fillRect((W / 2 - 1) * s, H * 0.18 * s, 2 * s, H * 0.64 * s);
  });
  // Buyable plot highlight tile.
  bakeTile("tile-buy", (g) => diamond(g, s, 0xffe27a, 0.28, { c: 0xfff0b8, a: 0.9, w: 2 }));
  // Target highlight (valid action / tap feedback).
  bakeTile("tile-target", (g) => diamond(g, s, 0xffffff, 0.16, { c: 0xffffff, a: 0.95, w: 3 }));

  // Farmer character — two walk frames.
  drawFarmer(scene, "farmer-0", s, 0);
  drawFarmer(scene, "farmer-1", s, 1);

  // Soft round particle.
  {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8 * s, 8 * s, 8 * s);
    g.generateTexture("spark", 16 * s, 16 * s);
    g.destroy();
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
