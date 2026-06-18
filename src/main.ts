import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { FarmScene } from "./scenes/FarmScene";
import { UIScene } from "./scenes/UIScene";
import { DPR } from "./scenes/BaseScene";
import { GameState } from "./state/GameState";

async function boot() {
  // Wait for the game font so the first frame isn't drawn in a fallback,
  // but never block boot longer than a moment if loading stalls.
  const fonts = Promise.all([
    document.fonts.load('400 16px "Fredoka"'),
    document.fonts.load('500 16px "Fredoka"'),
    document.fonts.load('600 16px "Fredoka"'),
    document.fonts.load('700 16px "Fredoka"'),
  ]);
  const timeout = new Promise((res) => setTimeout(res, 2000));
  await Promise.race([fonts, timeout]).catch(() => {});

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#bfe6ad",
    scale: {
      // Render the buffer at device pixels (crisp), display at CSS size.
      mode: Phaser.Scale.NONE,
      width: window.innerWidth * DPR,
      height: window.innerHeight * DPR,
      zoom: 1 / DPR,
    },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, FarmScene, UIScene],
  });

  const resize = () => {
    game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR);
    game.scale.setZoom(1 / DPR);
  };
  window.addEventListener("resize", resize);

  if (import.meta.env.DEV) {
    (window as any).__game = game;
    (window as any).__state = GameState;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) GameState.save();
  });
  window.addEventListener("pagehide", () => GameState.save());
}

boot();
