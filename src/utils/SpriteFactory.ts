import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig';

export class SpriteFactory {
  static createAll(scene: Phaser.Scene): void {
    this.hero(scene);
    this.enemies(scene);
    this.bullets(scene);
    this.xpGem(scene);
    this.particles(scene);
    this.defenseCore(scene);
  }

  private static g(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    return scene.add.graphics().setVisible(false);
  }

  private static hero(scene: Phaser.Scene): void {
    const g = this.g(scene);
    g.fillStyle(0x1e40af, 0.4);
    g.fillCircle(24, 26, 13);
    g.fillStyle(COLORS.hero);
    g.fillCircle(24, 24, 12);
    g.lineStyle(2, COLORS.heroLight);
    g.strokeCircle(24, 24, 12);
    g.fillStyle(COLORS.heroGun);
    g.fillRect(30, 21, 14, 6);
    g.fillStyle(0xffffff);
    g.fillRect(42, 22, 4, 4);
    g.fillStyle(0xbfdbfe);
    g.fillRect(20, 20, 8, 3);
    g.generateTexture('hero', 48, 48);
    g.destroy();
  }

  private static enemies(scene: Phaser.Scene): void {
    let g = this.g(scene);
    g.fillStyle(COLORS.slimeDark);
    g.fillRoundedRect(5, 7, 22, 20, 4);
    g.fillStyle(COLORS.slime);
    g.fillRoundedRect(5, 5, 22, 20, 4);
    g.fillStyle(0xffffff);
    g.fillCircle(13, 12, 3);
    g.fillCircle(21, 12, 3);
    g.fillStyle(0x064e3b);
    g.fillCircle(14, 12, 1.5);
    g.fillCircle(22, 12, 1.5);
    g.generateTexture('enemy_slime', 32, 32);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.bat);
    g.fillTriangle(14, 4, 2, 22, 26, 22);
    g.fillTriangle(2, 12, 0, 20, 8, 16);
    g.fillTriangle(26, 12, 28, 20, 20, 16);
    g.fillStyle(0xff6b6b);
    g.fillCircle(10, 14, 2);
    g.fillCircle(18, 14, 2);
    g.generateTexture('enemy_bat', 28, 28);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.archerDark);
    g.fillRect(8, 6, 16, 24);
    g.fillStyle(COLORS.archer);
    g.fillRect(8, 4, 16, 24);
    g.lineStyle(2, 0xfde68a);
    g.beginPath();
    g.arc(26, 16, 10, -1.2, 1.2);
    g.strokePath();
    g.fillStyle(0xffffff);
    g.fillCircle(13, 12, 2);
    g.fillCircle(19, 12, 2);
    g.generateTexture('enemy_archer', 36, 32);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.tankDark);
    g.fillRect(3, 5, 38, 36);
    g.fillStyle(COLORS.tank);
    g.fillRect(3, 3, 38, 36);
    g.lineStyle(2, 0x9ca3af);
    g.strokeRect(3, 3, 38, 36);
    g.lineStyle(2, COLORS.tankDark);
    g.lineBetween(10, 10, 34, 32);
    g.lineBetween(34, 10, 10, 32);
    g.fillStyle(0xd1d5db);
    g.fillRect(16, 6, 12, 6);
    g.generateTexture('enemy_tank', 44, 44);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.ninjaDark);
    g.fillTriangle(14, 2, 4, 24, 24, 24);
    g.fillStyle(COLORS.ninja);
    g.fillTriangle(14, 0, 2, 22, 26, 22);
    g.fillTriangle(2, 10, 0, 18, 6, 14);
    g.fillTriangle(26, 10, 28, 18, 22, 14);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 13, 2);
    g.fillCircle(18, 13, 2);
    g.fillStyle(0x064e3b);
    g.fillCircle(10, 13, 1);
    g.fillCircle(18, 13, 1);
    g.generateTexture('enemy_ninja', 28, 28);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.summonerDark);
    g.fillCircle(16, 16, 13);
    g.fillStyle(COLORS.summoner);
    g.fillCircle(16, 16, 11);
    g.lineStyle(2, 0xfbcfe8);
    for (let i = 0; i < 5; i++) {
      const sa = (Math.PI * 2 / 5) * i - Math.PI / 2;
      const ex = 16 + Math.cos(sa) * 14;
      const ey = 16 + Math.sin(sa) * 14;
      g.lineBetween(16, 16, ex, ey);
    }
    g.fillStyle(0xffffff);
    g.fillCircle(13, 14, 2);
    g.fillCircle(19, 14, 2);
    g.fillStyle(0xfce7f3);
    g.fillCircle(16, 8, 2);
    g.generateTexture('enemy_summoner', 32, 32);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.bomberDark);
    g.fillCircle(16, 17, 13);
    g.fillStyle(COLORS.bomber);
    g.fillCircle(16, 15, 11);
    g.lineStyle(2, 0xfda4af);
    g.strokeCircle(16, 15, 8);
    g.fillStyle(0xfef2f2);
    g.fillTriangle(16, 7, 11, 19, 21, 19);
    g.fillStyle(0x7f1d1d);
    g.fillCircle(16, 15, 3);
    g.generateTexture('enemy_bomber', 32, 32);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(COLORS.medicDark);
    g.fillRoundedRect(4, 5, 25, 25, 6);
    g.fillStyle(COLORS.medic);
    g.fillRoundedRect(4, 3, 25, 25, 6);
    g.fillStyle(0xecfeff);
    g.fillRect(14, 7, 5, 17);
    g.fillRect(8, 13, 17, 5);
    g.lineStyle(1, 0x67e8f9);
    g.strokeRoundedRect(4, 3, 25, 25, 6);
    g.generateTexture('enemy_medic', 34, 34);
    g.destroy();

    g = this.g(scene);
    g.lineStyle(3, COLORS.eliteGlow, 0.7);
    g.strokeCircle(24, 24, 22);
    g.lineStyle(1, 0xfca5a5, 0.4);
    g.strokeCircle(24, 24, 26);
    g.generateTexture('elite_glow', 52, 52);
    g.destroy();
  }

  private static bullets(scene: Phaser.Scene): void {
    let g = this.g(scene);
    g.fillStyle(COLORS.bulletGlow, 0.4);
    g.fillCircle(5, 5, 5);
    g.fillStyle(COLORS.bulletPlayer);
    g.fillCircle(5, 5, 3);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(4, 4, 1.5);
    g.generateTexture('bullet_player', 10, 10);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(0xfca5a5, 0.4);
    g.fillCircle(5, 5, 5);
    g.fillStyle(COLORS.bulletEnemy);
    g.fillCircle(5, 5, 3);
    g.generateTexture('bullet_enemy', 10, 10);
    g.destroy();
  }

  private static xpGem(scene: Phaser.Scene): void {
    const g = this.g(scene);
    g.fillStyle(COLORS.xpGemGlow, 0.3);
    g.fillCircle(8, 8, 7);
    g.fillStyle(COLORS.xpGem);
    const pts = [
      new Phaser.Geom.Point(8, 1),
      new Phaser.Geom.Point(14, 8),
      new Phaser.Geom.Point(8, 15),
      new Phaser.Geom.Point(2, 8),
    ];
    g.fillPoints(pts, true);
    g.fillStyle(0xddd6fe, 0.6);
    g.fillTriangle(8, 3, 6, 8, 10, 8);
    g.generateTexture('xp_gem', 16, 16);
    g.destroy();
  }

  private static particles(scene: Phaser.Scene): void {
    let g = this.g(scene);
    g.fillStyle(0xffffff);
    g.fillCircle(3, 3, 3);
    g.generateTexture('particle_white', 6, 6);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(0xfbbf24);
    g.fillCircle(2, 2, 2);
    g.generateTexture('particle_yellow', 4, 4);
    g.destroy();

    g = this.g(scene);
    g.fillStyle(0xef4444);
    g.fillCircle(2, 2, 2);
    g.generateTexture('particle_red', 4, 4);
    g.destroy();
  }

  private static defenseCore(scene: Phaser.Scene): void {
    const g = this.g(scene);
    for (let radius = 38; radius >= 16; radius -= 7) {
      g.fillStyle(0x3b82f6, 0.05 + (38 - radius) * 0.01);
      g.fillCircle(40, 40, radius);
    }
    g.lineStyle(3, 0x60a5fa, 0.9);
    g.strokeCircle(40, 40, 25);
    g.lineStyle(2, 0x93c5fd, 0.75);
    g.strokeCircle(40, 40, 15);
    g.fillStyle(0xfbbf24, 0.95);
    g.fillPoints([
      new Phaser.Geom.Point(40, 20), new Phaser.Geom.Point(53, 40),
      new Phaser.Geom.Point(40, 60), new Phaser.Geom.Point(27, 40),
    ], true);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(40, 40, 6);
    g.generateTexture('defense_core', 80, 80);
    g.destroy();
  }
}
