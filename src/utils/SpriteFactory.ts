import Phaser from 'phaser';

/** Original procedural paper-cut sprites; texture keys and collision sizes stay stable. */
export class SpriteFactory {
  static createAll(scene: Phaser.Scene): void {
    this.hero(scene); this.enemies(scene); this.bullets(scene);
    this.xpGem(scene); this.particles(scene); this.defenseCore(scene);
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
