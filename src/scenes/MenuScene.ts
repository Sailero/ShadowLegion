import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    const bgGraphics = this.add.graphics();
    this.drawMenuBackground(bgGraphics, width, height);

    this.add.text(width / 2, height * 0.2, '博弈大师', {
      fontSize: '48px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#4a9eff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.3, 'GAME MASTER', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#667788',
      letterSpacing: 8,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.38, '— 攻防博弈策略游戏 —', {
      fontSize: '14px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#556677',
    }).setOrigin(0.5);

    this.createButton(width / 2, height * 0.55, '开 始 游 戏', () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start('GameScene');
      });
    });

    this.createButton(width / 2, height * 0.65, '游 戏 说 明', () => {
      this.showInstructions();
    });

    this.add.text(width / 2, height * 0.88, '版本 v0.1.0-alpha', {
      fontSize: '12px',
      color: '#334455',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.92, '融合强化学习与博弈论的策略小游戏', {
      fontSize: '12px',
      color: '#334455',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(600);
  }

  private drawMenuBackground(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 15 + Math.random() * 25;
      const alpha = 0.03 + Math.random() * 0.05;
      g.fillStyle(0x4a9eff, alpha);

      g.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (Math.PI / 3) * j - Math.PI / 6;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (j === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
    }
  }

  private createButton(x: number, y: number, text: string, onClick: () => void): void {
    const btnW = 220, btnH = 48;

    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a2a3a, 1);
    bg.lineStyle(1, 0x4a9eff, 0.5);
    bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
    bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);

    const label = this.add.text(0, 0, text, {
      fontSize: '18px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ccddee',
    }).setOrigin(0.5);

    container.add([bg, label]);

    const hitArea = new Phaser.Geom.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x2a3a4a, 1);
      bg.lineStyle(2, 0x4a9eff, 1);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
      label.setColor('#ffffff');
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x1a2a3a, 1);
      bg.lineStyle(1, 0x4a9eff, 0.5);
      bg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
      bg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
      label.setColor('#ccddee');
    });

    container.on('pointerdown', onClick);
  }

  private showInstructions(): void {
    const { width, height } = this.cameras.main;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, width, height);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);

    const panel = this.add.graphics();
    const pw = 600, ph = 440;
    panel.fillStyle(0x0d1520, 1);
    panel.lineStyle(1, 0x4a9eff, 0.6);
    panel.fillRoundedRect((width - pw) / 2, (height - ph) / 2, pw, ph, 12);
    panel.strokeRoundedRect((width - pw) / 2, (height - ph) / 2, pw, ph, 12);

    const instructions = [
      '【游戏说明】',
      '',
      '▸ 这是一个回合制攻防博弈策略游戏',
      '▸ 在六边形网格上部署单位、建造防御工事',
      '▸ 与 AI 对手展开智慧的较量',
      '',
      '【操作方式】',
      '▸ 点击己方单位选中，蓝色区域为可移动范围',
      '▸ 点击蓝色区域移动，点击红色区域攻击',
      '▸ 部署阶段：从面板选择单位类型，点击己方区域放置',
      '▸ 行动阶段：移动和攻击己方单位',
      '▸ 点击「结束回合」交给 AI 行动',
      '',
      '【克制关系】',
      '▸ 突击兵 → 克制盾卫兵 → 克制狙击手 → 克制突击兵',
      '',
      '点击任意位置关闭',
    ];

    this.add.text(width / 2, (height - ph) / 2 + 24, instructions.join('\n'), {
      fontSize: '14px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#aabbcc',
      lineSpacing: 6,
      align: 'left',
    }).setOrigin(0.5, 0);

    overlay.on('pointerdown', () => {
      overlay.destroy();
      panel.destroy();
    });
  }
}
