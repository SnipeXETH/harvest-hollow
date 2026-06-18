/** Tunable game constants in one place. */
export const CONFIG = {
  // Isometric tile dimensions (2:1 diamond).
  tileWidth: 110,
  tileHeight: 55,

  // Farm grid.
  startGridSize: 6,
  maxGridSize: 10,

  // Starting wallet.
  startCoins: 50,
  startGems: 5,

  // Coins to hoe one grass tile into a soil plot (0 = free).
  tillCost: 0,

  // Cost (in coins) to expand the farm by one ring; scales with size.
  expansionBaseCost: 250,

  // Farmer movement: ms it takes to cross one tile-step (scaled by distance).
  walkMsPerTile: 150,
  walkMinMs: 220,
  walkMaxMs: 900,

  saveKey: "harvest-hollow-save-v1",
  saveVersion: 2,

  // Dev: when true, crops grow at this multiplier (1 = real time).
  // Toggled in-game via the ⏩ button.
  defaultTimeScale: 1,
};
