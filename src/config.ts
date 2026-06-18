/** Tunable game constants in one place. */
export const CONFIG = {
  // Isometric tile dimensions (2:1 diamond).
  tileWidth: 110,
  tileHeight: 55,

  // Land is bought as square chunks ("plots") of CHUNK×CHUNK tiles.
  chunkSize: 4,
  // Chunks the player owns at the start (a 2×2 block = bigger starting farm).
  startChunks: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as [number, number][],
  // World extent in chunks, from -worldRadius..worldRadius on each axis.
  worldRadiusChunks: 6,

  // Starting wallet.
  startCoins: 80,
  startGems: 5,

  // Coins to hoe one grass tile into soil (0 = free).
  tillCost: 0,

  // Buying the next land plot; scales with how many you already own.
  plotBaseCost: 120,
  plotCostGrowth: 1.6,

  // Camera (gameplay zoom multiplies the device-pixel-ratio base zoom).
  zoomMin: 0.45,
  zoomMax: 1.6,
  zoomStart: 0.8,

  // Farmer movement.
  walkSpeed: 150, // world px per second
  walkMinMs: 180,

  // How long the farmer works a tile (seconds). Scaled down by dev time-scale.
  tillSeconds: 6,
  plantSeconds: 1.2,
  harvestSeconds: 0.7,

  saveKey: "harvest-hollow-save-v1",
  saveVersion: 3,

  defaultTimeScale: 1,
};
