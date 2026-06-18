import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { FarmScene } from "./scenes/FarmScene";
import { DPR } from "./scenes/BaseScene";
import { GameState } from "./state/GameState";
import { UI } from "./ui/ui";
import { Sound } from "./audio/sound";

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

  // Use the visual viewport (the truly visible area) so touch coordinates
  // map accurately even as the mobile address bar shows / hides.
  const viewport = () => {
    const vv = window.visualViewport;
    return {
      w: Math.round(vv ? vv.width : window.innerWidth),
      h: Math.round(vv ? vv.height : window.innerHeight),
    };
  };

  const vp = viewport();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#72ad3e",
    scale: {
      // Render the buffer at device pixels (crisp), display at CSS size.
      mode: Phaser.Scale.NONE,
      width: vp.w * DPR,
      height: vp.h * DPR,
      zoom: 1 / DPR,
    },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, FarmScene],
  });

  UI.init();
  Sound.init();

  const resize = () => {
    const v = viewport();
    game.scale.resize(v.w * DPR, v.h * DPR);
    game.scale.setZoom(1 / DPR);
    game.scale.refresh(); // recompute canvas bounds for accurate input
  };
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
    window.visualViewport.addEventListener("scroll", () => game.scale.refresh());
  }

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
