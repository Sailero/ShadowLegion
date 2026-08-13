import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data: { score?: number; kills?: number; wave?: number; level?: number; victory?: boolean }) {
    const { score = 0, kills = 0, wave = 0, level = 1, victory = false } = data;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.bg);

    // decorative grid
    const dg = this.add.graphics();
    dg.lineStyle(1, 0x1e293b, 0.2);
    for (let x = 0; x <= GAME_WIDTH; x += 40) dg.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 40) dg.lineBetween(0, y, GAME_WIDTH, y);

    const titleColor = victory ? '#22c55e' : '#ef4444';
    const titleStr = victory ? '胜利！' : '阵亡';

    const title = this.add.text(GAME_WIDTH / 2, 70, titleStr, {
      fontSize: '48px', fontFamily: 'monospace', fontStyle: 'bold', color: titleColor,
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);

    this.tweens.add({ targets: title, alpha: 1, scaleX: 1, scaleY: 1, duration: 400, ease: 'Back.easeOut' });

    // Stats box
    const boxY = 130, boxH = 130, boxW = 300;
    const box = this.add.graphics();
    box.fillStyle(0x1e293b, 0.6); box.fillRoundedRect(GAME_WIDTH / 2 - boxW / 2, boxY, boxW, boxH, 8);
    box.lineStyle(1, 0x374151); box.strokeRoundedRect(GAME_WIDTH / 2 - boxW / 2, boxY, boxW, boxH, 8);

    const stats = [
      { label: '最终分数', value: `${score}`, color: '#fbbf24' },
      { label: '击杀数', value: `${kills}`, color: '#22c55e' },
      { label: '到达', value: `关卡 ${level} - 波次 ${wave}`, color: '#60a5fa' },
    ];

    stats.forEach((s, i) => {
      const y = boxY + 24 + i * 36;
      this.add.text(GAME_WIDTH / 2 - 80, y, s.label, {
        fontSize: '14px', fontFamily: 'monospace', color: '#9ca3af',
      }).setOrigin(0, 0.5);
      this.add.text(GAME_WIDTH / 2 + 80, y, s.value, {
        fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: s.color,
      }).setOrigin(1, 0.5);
    });

    this.makeBtn(GAME_WIDTH / 2, 310, '▸  再来一次', 0x3b82f6, () => {
      this.scene.start('ArenaScene', { level: 1 });
    });

    this.makeBtn(GAME_WIDTH / 2, 370, '返回菜单', 0x475569, () => {
      this.scene.start('MenuScene');
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 18, '按 R 快速重试', {
      fontSize: '11px', fontFamily: 'monospace', color: '#4b5563',
    }).setOrigin(0.5);

    this.input.keyboard!.on('keydown-R', () => {
      this.scene.start('ArenaScene', { level: 1 });
    });
  }

  private makeBtn(x: number, y: number, label: string, color: number, cb: () => void): void {
    const w = 180, h = 44;
    const g = this.add.graphics();
    g.fillStyle(color); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.lineStyle(1, 0x6b7280, 0.3); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);

    const t = this.add.text(x, y, label, {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hit.on('pointerover', () => {
      g.clear();
      g.fillStyle(Phaser.Display.Color.ValueToColor(color).lighten(15).color);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      t.setColor('#fbbf24');
    });
    hit.on('pointerout', () => {
      g.clear();
      g.fillStyle(color); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      g.lineStyle(1, 0x6b7280, 0.3); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
      t.setColor('#ffffff');
    });
    hit.on('pointerdown', cb);
  }
}
