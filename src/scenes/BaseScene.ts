import Phaser from "phaser";

/**
 * Device pixel ratio, capped so very high-density phones don't pay a huge
 * fill-rate cost. The game renders its backing buffer at this multiple of
 * CSS pixels so vector UI and text stay crisp on retina/mobile screens.
 */
export const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);

/**
 * Base for scenes that draw the UI in CSS-pixel coordinates while the canvas
 * renders at device resolution. We keep authoring in logical px (vw/vh) and
 * let a camera zoom of DPR map that onto the high-res buffer.
 */
export class BaseScene extends Phaser.Scene {
  /** Logical (CSS-pixel) viewport width. */
  get vw(): number {
    return this.scale.width / DPR;
  }
  /** Logical (CSS-pixel) viewport height. */
  get vh(): number {
    return this.scale.height / DPR;
  }

  /** Render at device resolution but keep a CSS-pixel coordinate system. */
  protected applyHiDPI(): void {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(DPR);
    cam.centerOn(this.vw / 2, this.vh / 2);
  }

  /** Text that rasterises at device resolution (crisp when zoomed). */
  protected tx(
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, style).setResolution(DPR);
  }
}
