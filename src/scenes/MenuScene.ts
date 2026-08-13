import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.bg);

    // decorative grid
    const dg = this.add.graphics();
    dg.lineStyle(1, 0x1e293b, 0.3);
    for (let x = 0; x <= GAME_WIDTH; x += 40) dg.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 40) dg.lineBetween(0, y, GAME_WIDTH, y);

    this.add.text(GAME_WIDTH / 2, 55, 'SHADOW LEGION', {
      fontSize: '42px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 95, '暗 影 军 团', {
      fontSize: '16px', fontFamily: 'monospace', color: '#9ca3af', letterSpacing: 8,
    }).setOrigin(0.5);

    // animated subtitle line
    const line = this.add.rectangle(GAME_WIDTH / 2, 112, 180, 2, 0x3b82f6, 0.4).setOrigin(0.5);
    this.tweens.add({ targets: line, scaleX: { from: 0, to: 1 }, duration: 600, ease: 'Cubic.easeOut' });

    // Start button
    const btnW = 200, btnH = 48;
    const btnY = 150;
    const btn = this.add.graphics();
    this.drawMenuBtn(btn, btnW, btnH, btnY, 0x3b82f6);
    const btnText = this.add.text(GAME_WIDTH / 2, btnY + btnH / 2, '▸  开始游戏', {
      fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    const hitArea = this.add.rectangle(GAME_WIDTH / 2, btnY + btnH / 2, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => { this.drawMenuBtn(btn, btnW, btnH, btnY, 0x60a5fa); btnText.setColor('#fbbf24'); });
    hitArea.on('pointerout', () => { this.drawMenuBtn(btn, btnW, btnH, btnY, 0x3b82f6); btnText.setColor('#ffffff'); });
    hitArea.on('pointerdown', () => this.scene.start('ArenaScene', { level: 1 }));

    // Instructions in columns
    const colLeft = GAME_WIDTH * 0.3, colRight = GAME_WIDTH * 0.7;
    this.drawSection(colLeft, 225, '操作', [
      'WASD — 移动',
      '鼠标 — 瞄准',
      '左键按住 — 射击',
      'Shift/右键 — 闪避',
      'Space — 蓄力技能',
    ]);
    this.drawSection(colRight, 225, '规则', [
      '每关10波 + Boss',
      '波间选择升级',
      '击杀获得XP宝石',
      '3关通关即胜利',
      '连杀获得额外分数',
    ]);
    this.drawSection(colLeft, 405, '敌人', [
      '● 史莱姆 — 直线追踪',
      '● 蝙蝠 — 高速变向',
      '● 弓箭手 — 远程射击',
      '● 重甲 — 缓慢高伤',
    ]);
    this.drawSection(colRight, 405, '提示', [
      '注意右下角小地图',
      '屏幕边缘有敌人指示',
      '蓄力满时立刻释放',
      '闪避中完全无敌',
    ]);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'v1.0 — Phase 1 Demo', {
      fontSize: '10px', fontFamily: 'monospace', color: '#374151',
    }).setOrigin(0.5);
  }

  private drawMenuBtn(g: Phaser.GameObjects.Graphics, w: number, h: number, y: number, color: number): void {
    g.clear();
    g.fillStyle(color); g.fillRoundedRect(GAME_WIDTH / 2 - w / 2, y, w, h, 8);
    g.lineStyle(1, 0x93c5fd, 0.3); g.strokeRoundedRect(GAME_WIDTH / 2 - w / 2, y, w, h, 8);
  }

  private drawSection(cx: number, startY: number, title: string, lines: string[]): void {
    this.add.text(cx, startY, title, {
      fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
    }).setOrigin(0.5);
    const divider = this.add.rectangle(cx, startY + 14, 80, 1, 0x374151).setOrigin(0.5);
    lines.forEach((line, i) => {
      this.add.text(cx, startY + 26 + i * 18, line, {
        fontSize: '11px', fontFamily: 'monospace', color: '#9ca3af',
      }).setOrigin(0.5);
    });
  }
}
