import Phaser from "phaser";
import { CONFIG } from "../config";

const W = CONFIG.tileWidth;
const H = CONFIG.tileHeight;

/** Diamond corner points for a W×H top face. */
function diamond(): { x: number; y: number }[] {
  return [
    { x: W / 2, y: 0 },
    { x: W, y: H / 2 },
    { x: W / 2, y: H },
    { x: 0, y: H / 2 },
  ];
}

function fillDiamond(
  g: Phaser.GameObjects.Graphics,
  fill: number,
  fillAlpha = 1,
  line?: { color: number; alpha: number; width: number }
) {
  const p = diamond();
  g.fillStyle(fill, fillAlpha);
  if (line) g.lineStyle(line.width, line.color, line.alpha);
  g.beginPath();
  g.moveTo(p[0].x, p[0].y);
  g.lineTo(p[1].x, p[1].y);
  g.lineTo(p[2].x, p[2].y);
  g.lineTo(p[3].x, p[3].y);
  g.closePath();
  g.fillPath();
  if (line) g.strokePath();
}

export function generateTextures(scene: Phaser.Scene): void {
  const bake = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, W, H);
    g.destroy();
  };

  // Seamless grass (no border so a field reads as continuous).
  bake("tile-grass", (g) => fillDiamond(g, 0x7cc24a));
  // A second, faintly different grass for subtle life (used sparsely).
  bake("tile-grass-2", (g) => fillDiamond(g, 0x83c952));
  // Faded grass for the locked expansion ring.
  bake("tile-grass-locked", (g) => fillDiamond(g, 0x9fc285, 0.55));

  // Tilled soil plot — distinct, with a soft rim so it reads as a bed.
  bake("tile-soil", (g) => {
    fillDiamond(g, 0x9b5e34, 1, { color: 0x6f3f20, alpha: 0.6, width: 2 });
    // furrow sheen
    g.fillStyle(0xa86a3c, 0.5);
    g.fillRect(W / 2 - 1, H * 0.18, 2, H * 0.64);
  });

  // Grid line overlay (shown only in a tool mode).
  bake("tile-grid", (g) =>
    fillDiamond(g, 0xffffff, 0.0, { color: 0xffffff, alpha: 0.35, width: 1.5 })
  );

  // Valid-target highlight (hover / tappable in tool mode).
  bake("tile-target", (g) =>
    fillDiamond(g, 0xffffff, 0.18, { color: 0xffffff, alpha: 0.95, width: 3 })
  );

  // Soft round particle for harvest / dust bursts.
  {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture("spark", 16, 16);
    g.destroy();
  }
}
