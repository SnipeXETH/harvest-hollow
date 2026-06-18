import Phaser from "phaser";
import { generateTextures } from "../art/TextureFactory";
import { GameState } from "../state/GameState";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    generateTextures(this);
    GameState.load();
    this.scene.start("FarmScene");
  }
}
