import Phaser from 'phaser';
import { OPERATIVE_VISUALS, type OperativeVisual } from '../data/operativeVisuals';
import { CatSpriteFactory } from './CatSpriteFactory';

export interface OperativeSpriteSources {
  portraitTexture?: string;
  combatTexture?: string;
  /** Disable until a replacement character's pose has matching accessory anchors. */
  accessories?: boolean;
}

/** Original procedural paper-cut sprites; texture keys and collision sizes stay stable. */
export class SpriteFactory {
  static createAll(scene: Phaser.Scene): void {
    this.hero(scene); this.enemies(scene); this.bullets(scene);
    this.xpGem(scene); this.particles(scene); this.defenseCore(scene);
    this.paintedSprites(scene);
    if (!CatSpriteFactory.createAll(scene)) this.createOperativeSprites(scene);
    this.paintedGround(scene);
  }
  /** Composite once at portrait resolution, then downsample the identical outfit for combat. */
  static createOperativeSprites(scene: Phaser.Scene, sources: OperativeSpriteSources = {}): void {
    const combatKey = sources.combatTexture ?? 'hero';
    const preferredPortrait = sources.portraitTexture ?? 'traveler-portrait';
    const sourceKey = scene.textures.exists(preferredPortrait) ? preferredPortrait : combatKey;
    const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const heroFrame = scene.textures.get(combatKey).get();
    for (const appearance of Object.values(OPERATIVE_VISUALS)) {
      for (const key of [appearance.portraitTexture, appearance.heroTexture]) {
        if (scene.textures.exists(key)) scene.textures.remove(key);
      }
      const portrait = scene.textures.createCanvas(appearance.portraitTexture, 280, 280);
      if (!portrait) continue;
      const context = portrait.context;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, 280, 280);
      context.save();
      context.scale(2.8, 2.8);
      if (sources.accessories !== false) this.drawOperativeOutfit(context, appearance.accessory);
      context.restore();
      portrait.refresh();
      // Preserve the source frame dimensions, origin and Arcade body offsets.
      // The ordinary hero and the two shadow appearances retain their original textures.
      const combat = scene.textures.createCanvas(appearance.heroTexture, heroFrame.width, heroFrame.height);
      if (!combat) continue;
      combat.context.imageSmoothingEnabled = true;
      combat.context.imageSmoothingQuality = 'high';
      combat.context.drawImage(portrait.canvas, 0, 0, heroFrame.width, heroFrame.height);
      combat.refresh();
    }
  }

  /** Accessories occupy cape/hand space; the original face and ear silhouette remain clear. */
  private static drawOperativeOutfit(c: CanvasRenderingContext2D, accessory: OperativeVisual['accessory']): void {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const shape = (fill: string, stroke: string, draw: () => void, width = 1.2) => {
      c.beginPath(); draw(); c.fillStyle = fill; c.fill();
      c.strokeStyle = stroke; c.lineWidth = width; c.stroke();
    };
    const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, stroke: string, angle = 0) =>
      shape(fill, stroke, () => c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2));
    const line = (points: number[][], color: string, width = 1) => {
      c.beginPath(); c.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) c.lineTo(point[0], point[1]);
      c.strokeStyle = color; c.lineWidth = width; c.stroke();
    };
    const leaf = (x: number, y: number, direction = 1) => {
      shape('#b6c789', '#718354', () => {
        c.moveTo(x, y); c.quadraticCurveTo(x - 5 * direction, y - 7, x - 12 * direction, y - 5);
        c.quadraticCurveTo(x - 9 * direction, y + 2, x, y);
      }, .9);
      line([[x - direction, y], [x - 9 * direction, y - 4]], '#e6e1ae', .7);
    };
    const patchStitches = (points: number[][]) => {
      c.save(); c.setLineDash([1.5, 2]); line(points, '#fff1cf', .8); c.restore();
    };

    if (accessory === 'flower') {
      // A peach flower wand gives the swift traveller a light, radial outline.
      line([[69, 73], [86, 57]], '#796a41', 3.8);
      line([[69, 72], [86, 56]], '#c0ae70', 1.2);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5 - Math.PI / 2;
        ellipse(87 + Math.cos(angle) * 5, 55 + Math.sin(angle) * 5, 4.2, 3.4, i % 2 ? '#efbb92' : '#f5d1a5', '#b48156', angle);
      }
      ellipse(87, 55, 3.6, 3.6, '#e1aa50', '#a27b41');
      ellipse(86.3, 54.4, 1.25, 1.25, '#fff1b9', '#fff1b9');
      leaf(80, 62); leaf(80, 63, -1);
      // Two floating scarf ends are attached to the existing neck knot.
      shape('#e3a16e', '#a4754e', () => {
        c.moveTo(39, 52); c.quadraticCurveTo(27, 48, 18, 53); c.lineTo(23, 57);
        c.lineTo(17, 61); c.quadraticCurveTo(31, 60, 42, 56); c.closePath();
      });
      patchStitches([[22, 54], [31, 53], [38, 54]]);
    } else if (accessory === 'popcorn') {
      // Striped bucket pack plus two round brass mouths, visibly wider than the wand.
      shape('#c98757', '#875f3f', () => {
        c.moveTo(20, 51); c.lineTo(43, 52); c.lineTo(40, 76);
        c.quadraticCurveTo(31, 81, 22, 74); c.closePath();
      }, 1.5);
      for (let i = 0; i < 3; i++) {
        shape('#f3ddaf', '#e4c391', () => {
          const x = 23 + i * 6;
          c.moveTo(x, 54); c.lineTo(x + 3, 54); c.lineTo(x + 2, 75); c.lineTo(x, 74); c.closePath();
        }, .6);
      }
      for (const [x, y, r] of [[23, 50, 4.4], [30, 46, 5.3], [38, 49, 4.8], [29, 53, 4.6], [36, 54, 3.5]]) {
        ellipse(x, y, r, r * .85, '#f9e6b3', '#bc9a5a');
        ellipse(x - 1, y - 1, r * .36, r * .3, '#fff5d5', '#fff5d5');
      }
      for (const [x, y] of [[87, 56], [88, 65]]) {
        shape('#bd8754', '#775a3d', () => {
          c.moveTo(66, 68); c.lineTo(x - 2, y - 4); c.lineTo(x + 4, y + 3); c.lineTo(70, 77); c.closePath();
        }, 1.4);
        ellipse(x + 1, y, 6, 4.8, '#edc881', '#906b40', -.35);
        ellipse(x + 2, y, 2.9, 2.4, '#82663e', '#c69b58', -.35);
        line([[71, 69], [x - 1, y - 2]], '#f5db9e', .85);
      }
    } else if (accessory === 'quilt') {
      // A broad scalloped quilt shield is a material/silhouette cue, not a global tint.
      shape('#b9a6c4', '#80718f', () => {
        c.moveTo(69, 55); c.quadraticCurveTo(81, 52, 89, 61);
        c.quadraticCurveTo(94, 71, 88, 82); c.quadraticCurveTo(82, 91, 71, 93);
        c.quadraticCurveTo(59, 88, 57, 76); c.quadraticCurveTo(54, 64, 61, 59); c.closePath();
      }, 1.5);
      shape('#dfd3de', '#a997b3', () => {
        c.moveTo(69, 60); c.quadraticCurveTo(80, 56, 85, 64); c.quadraticCurveTo(90, 76, 83, 84);
        c.lineTo(72, 89); c.quadraticCurveTo(61, 82, 61, 72); c.quadraticCurveTo(60, 64, 69, 60);
      }, .8);
      line([[64, 63], [84, 79]], '#b3a0b9', .85);
      line([[62, 72], [79, 86]], '#b3a0b9', .85);
      line([[78, 60], [62, 79]], '#b3a0b9', .85);
      line([[85, 67], [69, 87]], '#b3a0b9', .85);
      patchStitches([[69, 59], [78, 58], [86, 65], [88, 73], [84, 83], [72, 90], [62, 82], [59, 71], [63, 63], [69, 59]]);
      // A warm heart patch keeps the defensive equipment soft and welcoming.
      shape('#efc78f', '#b58d65', () => {
        c.moveTo(73, 69); c.bezierCurveTo(66, 62, 64, 74, 73, 79);
        c.bezierCurveTo(85, 72, 79, 63, 73, 69);
      }, .9);
    } else {
      // A honeycomb tool pack and pale wings identify the deployable-helper specialist.
      ellipse(19, 54, 6.8, 10.5, '#e3ecda', '#8da497', -.55);
      ellipse(41, 52, 6.3, 10, '#edf0d6', '#8da497', .5);
      shape('#d9b669', '#8e814d', () => {
        c.moveTo(28, 49); c.lineTo(42, 56); c.lineTo(42, 73); c.lineTo(29, 81);
        c.lineTo(17, 73); c.lineTo(17, 57); c.closePath();
      }, 1.5);
      for (const [x, y] of [[25, 61], [34, 61], [29.5, 69]]) {
        shape('#f3d891', '#b29452', () => {
          for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + Math.PI / 6;
            const px = x + Math.cos(a) * 4.2, py = y + Math.sin(a) * 4.2;
            if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.closePath();
        }, .8);
      }
      line([[24, 51], [21, 44], [23, 41]], '#667e68', 1.5);
      ellipse(23, 40, 2.6, 2.6, '#d9bf6c', '#8b8151');
      // A small matching bee on the original wand links the pack to the hand.
      ellipse(85, 51, 4, 6, '#e8edd4', '#92a68c', -.5);
      ellipse(92, 52, 3.7, 5.3, '#e8edd4', '#92a68c', .55);
      ellipse(88, 58, 7, 5.4, '#e5be68', '#8c814d', -.25);
      line([[85, 54], [87, 62]], '#8b8358', 2);
      line([[90, 54], [92, 61]], '#8b8358', 1.8);
      ellipse(93, 57, 1, 1, '#485e4b', '#485e4b');
    }
  }
  /** Atlas frames are normalized to stable physics sizes; the original alpha is preserved. */
  private static paintedSprites(scene: Phaser.Scene): void {
    if (!scene.textures.exists('garden-atlas')) return;
    const source = scene.textures.get('garden-atlas').getSourceImage() as HTMLImageElement;
    const rows = [0, .344, .648, 1];
    const frames: Array<[string, number, number, number]> = [
      ['hero', 0, 0, 56], ['shadow_fox', 1, 0, 52], ['enemy_slime', 2, 0, 40], ['enemy_bat', 3, 0, 40],
      ['enemy_archer', 0, 1, 44], ['enemy_tank', 1, 1, 54], ['enemy_ninja', 2, 1, 42], ['enemy_summoner', 3, 1, 46],
      ['enemy_bomber', 0, 2, 44], ['enemy_medic', 1, 2, 46], ['defense_core', 2, 2, 90], ['garden_tree', 3, 2, 160],
      ['portrait_hero', 0, 0, 280], ['portrait_shadow', 1, 0, 280], ['traveler-portrait', 0, 0, 280],
    ];
    for (const [key, column, row, size] of frames) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const texture = scene.textures.createCanvas(key, size, size);
      if (!texture) continue;
      const context = texture.context;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const width = source.width / 4, height = source.height * (rows[row + 1] - rows[row]);
      context.drawImage(source, column * width, source.height * rows[row], width, height, 0, 0, size, size);
      texture.refresh();
    }
  }
  private static paintedGround(scene: Phaser.Scene): void {
    if (!scene.textures.exists('terrain-atlas')) return;
    const source = scene.textures.get('terrain-atlas').getSourceImage() as HTMLImageElement;
    for (let index = 0; index < 6; index++) {
      const texture = scene.textures.createCanvas(index === 5 ? 'paper-grain' : `ground-${index + 1}`, 1024, 1024);
      if (!texture) continue;
      // Mirror adjacent tiles at their shared edges. Generated material swatches
      // need this continuous boundary even if the source was not perfectly seamless.
      for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) {
        const context = texture.context;
        context.save();
        context.translate(column ? 1024 : 0, row ? 1024 : 0);
        context.scale(column ? -1 : 1, row ? -1 : 1);
        context.drawImage(source, index % 3 * source.width / 3, Math.floor(index / 3) * source.height / 2,
          source.width / 3, source.height / 2, 0, 0, 512, 512);
        context.restore();
      }
      texture.refresh();
    }
  }
  private static g(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    return scene.add.graphics().setVisible(false);
  }
  private static finish(g: Phaser.GameObjects.Graphics, key: string, width: number, height: number): void {
    g.generateTexture(key, width, height); g.destroy();
  }
  private static eyes(g: Phaser.GameObjects.Graphics, x: number, y: number, gap = 7, size = 1.7): void {
    g.fillStyle(0xfffcf2).fillCircle(x - gap / 2, y, size + 0.7).fillCircle(x + gap / 2, y, size + 0.7);
    g.fillStyle(0x3c4d40).fillCircle(x - gap / 2, y + 0.25, size).fillCircle(x + gap / 2, y + 0.25, size);
    g.fillStyle(0xecb3a0, 0.8).fillEllipse(x - gap / 2 - 3, y + 4, 4, 2).fillEllipse(x + gap / 2 + 3, y + 4, 4, 2);
  }
  private static leaf(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number): void {
    g.fillStyle(color).fillTriangle(x, y - size, x - size * 0.68, y + size * 0.33, x, y + size * 0.7);
    g.fillTriangle(x, y - size, x + size * 0.68, y + size * 0.33, x, y + size * 0.7);
    g.lineStyle(0.8, 0xf0efbc, 0.7).lineBetween(x, y - size * 0.6, x, y + size * 0.65);
  }

  private static hero(scene: Phaser.Scene): void {
    const g = this.g(scene);
    g.fillStyle(0x4e6347, 0.18).fillEllipse(22, 36, 29, 10);
    g.fillStyle(0xa07756).fillRoundedRect(13, 31, 8, 10, 3).fillRoundedRect(24, 31, 8, 10, 3);
    g.fillStyle(0xeff0cd).fillCircle(22, 24, 14);
    g.lineStyle(1.6, 0x627957).strokeCircle(22, 24, 14);
    g.fillStyle(0xf8dfaf).fillEllipse(23, 23, 23, 20);
    // The peach scarf is a readable silhouette even at the in-game 48px size.
    g.fillStyle(0xd88760).fillRoundedRect(10, 31, 25, 5, 2);
    g.fillTriangle(11, 31, 5, 42, 17, 37);
    g.fillStyle(0xb6c589).fillEllipse(21, 12, 29, 10);
    g.fillStyle(0x789461).fillEllipse(21, 10, 21, 12);
    this.leaf(g, 24, 5, 5, 0xb7cb8a);
    this.eyes(g, 23, 22, 8, 1.6);
    g.lineStyle(1, 0xb78259).beginPath().arc(23, 25, 3, 0.25, Math.PI - 0.25).strokePath();
    // A seed-popper, facing right like the previous weapon texture.
    g.fillStyle(0x759572).fillRoundedRect(32, 22, 12, 6, 2);
    g.fillStyle(0xf3cb76).fillCircle(43, 25, 4);
    g.fillStyle(0xfff7ce).fillCircle(44, 25, 2);
    this.finish(g, 'hero', 48, 48);
  }

  private static enemies(scene: Phaser.Scene): void {
    // Leaf dumpling: slow, round and easy to spot against warm ground.
    let g = this.g(scene);
    g.fillStyle(0x52674c, 0.17).fillEllipse(16, 27, 24, 7);
    g.fillStyle(0x91b779).fillRoundedRect(4, 8, 24, 20, 9);
    g.lineStyle(1.2, 0x607f56).strokeRoundedRect(4, 8, 24, 20, 9);
    g.fillStyle(0xbacf8e).fillEllipse(13, 11, 14, 7);
    this.leaf(g, 17, 5, 4, 0x6f955f);
    this.eyes(g, 16, 17, 8);
    this.finish(g, 'enemy_slime', 32, 32);

    // Flutter moth: wide wings distinguish a quick flanker from walkers.
    g = this.g(scene);
    g.fillStyle(0xaa8bab).fillEllipse(6, 15, 12, 17).fillEllipse(22, 15, 12, 17);
    g.fillStyle(0xd4b4c7).fillEllipse(6, 12, 8, 10).fillEllipse(22, 12, 8, 10);
    g.fillStyle(0xf0ccac).fillEllipse(14, 16, 10, 17);
    g.lineStyle(1, 0x8a6f80).lineBetween(12, 9, 9, 4).lineBetween(16, 9, 19, 4);
    g.fillStyle(0xf2d9b1).fillCircle(9, 4, 2).fillCircle(19, 4, 2);
    this.eyes(g, 14, 13, 4, 1.1);
    this.finish(g, 'enemy_bat', 28, 28);

    // A mushroom seed-slinger. The stalk and bow retain the ranged silhouette.
    g = this.g(scene);
    g.fillStyle(0x836b4c, 0.17).fillEllipse(16, 29, 26, 5);
    g.fillStyle(0xf4e4c3).fillRoundedRect(8, 12, 17, 18, 5);
    g.lineStyle(1.2, 0x9e805b).strokeRoundedRect(8, 12, 17, 18, 5);
    g.fillStyle(0xdca271).fillEllipse(16, 12, 29, 17);
    g.fillStyle(0xfff1ca).fillCircle(9, 9, 2.5).fillCircle(20, 7, 2.5).fillCircle(24, 13, 2);
    this.eyes(g, 16, 21, 6, 1.3);
    g.lineStyle(2, 0x806d4d).beginPath().arc(29, 21, 8, -1.3, 1.3).strokePath();
    g.lineStyle(1, 0xe7c89b).lineBetween(31, 13, 31, 29);
    this.finish(g, 'enemy_archer', 36, 32);

    // Acorn tortoise: squared shell advertises a tougher defensive unit.
    g = this.g(scene);
    g.fillStyle(0x725d44, 0.19).fillEllipse(22, 38, 39, 10);
    g.fillStyle(0xb3ad7c).fillRoundedRect(2, 13, 40, 27, 9);
    g.fillStyle(0xc69961).fillRoundedRect(5, 6, 34, 30, 10);
    g.lineStyle(2, 0x927d54).strokeRoundedRect(5, 6, 34, 30, 10);
    g.fillStyle(0xdfbb7a).fillRoundedRect(9, 7, 26, 21, 8);
    g.lineStyle(1.2, 0xbe985f).lineBetween(10, 15, 34, 15).lineBetween(15, 9, 15, 24).lineBetween(28, 9, 28, 24);
    g.fillStyle(0xf0dab1).fillRoundedRect(13, 26, 18, 13, 5);
    this.eyes(g, 22, 31, 7, 1.4);
    this.leaf(g, 23, 5, 4, 0x839859);
    this.finish(g, 'enemy_tank', 44, 44);

    // Paper swallow: pointed body communicates fast lunging without menace.
    g = this.g(scene);
    g.fillStyle(0x75a092).fillTriangle(14, 2, 1, 22, 27, 22);
    g.fillStyle(0xb5cbb0).fillTriangle(14, 2, 3, 18, 14, 15);
    g.fillStyle(0xe7e5be).fillTriangle(14, 9, 9, 24, 21, 24);
    g.fillStyle(0x649387).fillTriangle(4, 11, 0, 18, 8, 16).fillTriangle(24, 11, 28, 18, 20, 16);
    this.eyes(g, 15, 17, 5, 1.1);
    this.finish(g, 'enemy_ninja', 28, 28);

    // Bloom caller: petals around the face preserve the summoner's radial shape.
    g = this.g(scene);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      g.fillStyle(i % 2 ? 0xd89baf : 0xe7b6bb).fillCircle(16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 6);
    }
    g.fillStyle(0xf4e0b0).fillCircle(16, 16, 9);
    g.lineStyle(1, 0xb99a64).strokeCircle(16, 16, 9);
    this.eyes(g, 16, 15, 6, 1.3);
    this.finish(g, 'enemy_summoner', 32, 32);

    // A squash full of confetti: its circular warning silhouette remains clear.
    g = this.g(scene);
    g.fillStyle(0x94644e, 0.15).fillEllipse(16, 27, 26, 7);
    g.fillStyle(0xd77e5c).fillCircle(16, 17, 12);
    g.fillStyle(0xe9a06f).fillEllipse(16, 17, 14, 23);
    g.lineStyle(1, 0xb3694a).strokeCircle(16, 17, 12);
    this.eyes(g, 16, 17, 7, 1.4);
    g.fillStyle(0x806f48).fillRoundedRect(14, 2, 4, 6, 2);
    this.leaf(g, 21, 5, 4, 0x8ca76b);
    g.fillStyle(0xfdf0b3).fillCircle(25, 5, 2);
    this.finish(g, 'enemy_bomber', 32, 32);

    // Mint tea helper: an obvious plus sign keeps support priority readable.
    g = this.g(scene);
    g.fillStyle(0x5b837b, 0.15).fillEllipse(17, 29, 29, 7);
    g.fillStyle(0x9ebeb0).fillRoundedRect(5, 8, 24, 22, 7);
    g.lineStyle(1.3, 0x658e7f).strokeRoundedRect(5, 8, 24, 22, 7);
    g.fillStyle(0xece6c9).fillRoundedRect(9, 4, 16, 7, 3);
    g.fillStyle(0xfff8de).fillRect(15, 15, 4, 12).fillRect(11, 19, 12, 4);
    g.fillStyle(0x607f6a).fillCircle(11, 13, 1.2).fillCircle(23, 13, 1.2);
    this.finish(g, 'enemy_medic', 34, 34);

    g = this.g(scene);
    g.lineStyle(2.2, 0xc58a43, 0.9).strokeCircle(26, 26, 21);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      g.fillStyle(0xf5c875, 0.95).fillCircle(26 + Math.cos(a) * 24, 26 + Math.sin(a) * 24, 1.7);
    }
    this.finish(g, 'elite_glow', 52, 52);
  }

  private static bullets(scene: Phaser.Scene): void {
    let g = this.g(scene);
    g.fillStyle(0xf5d172, 0.3).fillCircle(5, 5, 5);
    g.fillStyle(0xa87732).fillEllipse(5, 5, 8, 6);
    g.fillStyle(0xffde80).fillEllipse(5, 5, 6, 4);
    g.fillStyle(0xfff8d4).fillEllipse(5, 4, 3, 1.5);
    this.finish(g, 'bullet_player', 10, 10);
    g = this.g(scene);
    g.fillStyle(0xd47f69, 0.25).fillCircle(5, 5, 5);
    g.fillStyle(0x9b4d45).fillPoints([{ x: 5, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 5 }], true);
    g.fillStyle(0xeeab87).fillPoints([{ x: 5, y: 2 }, { x: 8, y: 5 }, { x: 5, y: 8 }, { x: 2, y: 5 }], true);
    this.finish(g, 'bullet_enemy', 10, 10);
  }

  private static xpGem(scene: Phaser.Scene): void {
    const g = this.g(scene);
    g.fillStyle(0xeacb70, 0.2).fillCircle(8, 8, 8);
    g.fillStyle(0xb48945).fillPoints([{ x: 8, y: 1 }, { x: 14, y: 8 }, { x: 8, y: 15 }, { x: 2, y: 8 }], true);
    g.fillStyle(0xf7d789).fillPoints([{ x: 8, y: 3 }, { x: 12, y: 8 }, { x: 8, y: 13 }, { x: 4, y: 8 }], true);
    g.fillStyle(0xfff8d7).fillTriangle(8, 3, 5, 8, 8, 9);
    this.finish(g, 'xp_gem', 16, 16);
  }

  private static particles(scene: Phaser.Scene): void {
    let g = this.g(scene);
    g.fillStyle(0xffffff).fillRoundedRect(0, 1, 6, 4, 2);
    this.finish(g, 'particle_white', 6, 6);
    g = this.g(scene); g.fillStyle(0xf2ce83).fillRect(0, 0, 4, 4);
    this.finish(g, 'particle_yellow', 4, 4);
    g = this.g(scene); g.fillStyle(0xe8af90).fillEllipse(2, 2, 4, 3);
    this.finish(g, 'particle_red', 4, 4);
  }

  private static defenseCore(scene: Phaser.Scene): void {
    const g = this.g(scene);
    g.fillStyle(0xf8e6ad, 0.22).fillCircle(40, 40, 36);
    g.fillStyle(0x65774a, 0.22).fillEllipse(40, 64, 69, 19);
    g.lineStyle(2, 0xb79666).lineBetween(12, 65, 21, 53).lineBetween(68, 65, 58, 53);
    g.fillStyle(0xd99962).fillTriangle(40, 14, 10, 62, 70, 62);
    g.lineStyle(1.8, 0x9e7651).strokeTriangle(40, 14, 10, 62, 70, 62);
    g.fillStyle(0xf6d8a0).fillTriangle(40, 14, 48, 62, 70, 62);
    g.fillStyle(0x5d7860).fillTriangle(33, 39, 24, 62, 48, 62);
    g.fillStyle(0xf8eac1).fillTriangle(33, 39, 35, 62, 24, 62);
    g.lineStyle(2, 0x866c4d).lineBetween(40, 15, 40, 3);
    g.fillStyle(0xc8846a).fillTriangle(41, 3, 58, 8, 41, 14);
    g.fillStyle(0x8ca578).fillEllipse(15, 64, 10, 6).fillEllipse(66, 63, 10, 6);
    g.fillStyle(0xf9dea2).fillCircle(16, 61, 3).fillCircle(66, 60, 3);
    this.finish(g, 'defense_core', 80, 80);
  }
}
