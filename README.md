# 🌱 Harvest Hollow

A cozy, click-to-farm mobile game inspired by the original FarmVille. Plant
seeds on an isometric plot, wait on real-clock timers, harvest for coins + XP,
level up to unlock better crops, and expand your farm.

> Working title — easy to rename.

## Core loop

`Tap empty soil → pick a seed → it grows on a real timer → tap to harvest →
earn coins + XP → level up → unlock new seeds → expand the farm → repeat.`

## Tech stack

- **Phaser 3** + **TypeScript** + **Vite** — web-first so we can iterate fast.
- All farm art is **generated at runtime** (vector isometric tiles, emoji crops)
  — zero image assets to manage yet. Swap in real sprites later by replacing
  `src/art/TextureFactory.ts` and the crop glyphs.
- Save data persists to `localStorage`; crop timers use the real clock, so
  crops keep growing while the app is closed.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle into dist/
```

## Project layout

| Path | Role |
|------|------|
| `src/config.ts` | Tunable constants (tile size, grid, costs, save key). |
| `src/data/crops.ts` | The crop curve — cost, sell price, XP, grow time, unlock level. |
| `src/data/levels.ts` | XP → level curve and progress helpers. |
| `src/state/GameState.ts` | Single source of truth: wallet, plots, save/load, events. |
| `src/art/TextureFactory.ts` | Generates all tile/particle textures at boot. |
| `src/scenes/FarmScene.ts` | Isometric board, planting, growing, harvesting, juice. |
| `src/scenes/UIScene.ts` | HUD, level bar, seed picker, expand prompt, toasts. |

## Crops (MVP)

| Crop | Unlock | Seed | Sells | Grows in |
|------|:------:|:----:|:-----:|:--------:|
| 🥕 Carrot | Lvl 1 | 10 | 18 | 30s |
| 🌾 Wheat | Lvl 1 | 20 | 38 | 2m |
| 🌽 Corn | Lvl 2 | 45 | 95 | 5m |
| 🍅 Tomato | Lvl 3 | 80 | 180 | 15m |
| 🎃 Pumpkin | Lvl 5 | 160 | 420 | 1h |

## Dev tools

- The **⏩** button (bottom-right) cycles a time-scale (1× → 60× → 600×) so you
  can test grow times without waiting. Real-time at 1×.

## Monetization (designed, not yet wired)

Free-to-play dual-currency economy: 🪙 coins (earned) + 💎 gems (premium).
Coins buy seeds and farm expansions; gems are reserved for the future premium
shop (instant-grow, decorations, exclusive crops). No real payments in the MVP.

## Path to the App Store / Play Store

The web build wraps cleanly with [Capacitor](https://capacitorjs.com/):

```bash
npm i -D @capacitor/cli && npm i @capacitor/core
npx cap init "Harvest Hollow" com.harvesthollow.app --web-dir=dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```

## Roadmap

- [ ] Decorations (place & move cosmetic items on the farm)
- [ ] Premium gem shop + real IAP via Capacitor
- [ ] Sound + music
- [ ] Daily rewards / login streak
- [ ] Crop withering grace period & fertilizer
- [ ] Pinch-zoom & pan for larger farms
- [ ] Cloud save
"# harvest-hollow" 
