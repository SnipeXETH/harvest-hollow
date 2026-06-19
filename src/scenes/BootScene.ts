import Phaser from "phaser";
import { generateTextures } from "../art/TextureFactory";
import { GameState } from "../state/GameState";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // Uploaded ground textures (optional — game falls back to procedural art).
    this.load.image("grass-src", "assets/Grass_Texture.png");
    this.load.image("dirt-src", "assets/Dirt_Texture.png");
  }

  create() {
    generateTextures(this);
    GameState.load();
    this.scene.start("FarmScene");
  }
}
