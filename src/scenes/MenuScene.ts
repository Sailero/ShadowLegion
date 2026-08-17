import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { SoundManager } from '../systems/SoundManager';
import { ScoreManager } from '../systems/ScoreManager';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const snd = SoundManager.get();
    this.cameras.main.setBackgroundColor(0x080c14);

    const glow = this.add.graphics();
    for (let r = 280; r > 0; r -= 30) {
      glow.fillStyle(0x0d2040, 0.02);
      glow.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, r);
    }

    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.22, 'SHADOW LEGION', {
      fontSize: '44px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.22 + 50, '暗影军团', {
      fontSize: '18px', fontFamily: 'monospace', color: '#475569',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, y: title.y - 10, duration: 600, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, y: sub.y - 10, duration: 600, ease: 'Cubic.easeOut', delay: 150 });

    const line = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.22 + 75, 80, 1, 0x3b82f6, 0.5).setOrigin(0.5);
    this.tweens.add({ targets: line, scaleX: { from: 0, to: 1 }, duration: 500, delay: 300 });

    const high = ScoreManager.getHighScore();
    if (high > 0) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, `最高分 ${ScoreManager.formatScore(high)}`, {
        fontSize: '16px', fontFamily: 'monospace', color: '#fbbf24',
      }).setOrigin(0.5);
    }

    this.makeBtn(GAME_WIDTH / 2, GAME_HEIGHT * 0.48, '开始游戏', false, snd, () => {
      this.scene.start('ArenaScene', { level: 1 });
    });

    this.makeBtn(GAME_WIDTH / 2, GAME_HEIGHT * 0.48 + 60, '无尽模式', true, snd, () => {
      this.scene.start('ArenaScene', { level: 1, endless: true });
    });

    const hints = [
      'WASD 移动  |  鼠标 瞄准  |  左键 射击',
      'Shift 闪避  |  Space 技能  |  Q 切换技能',
    ];
    hints.forEach((h, i) => {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.78 + i * 24, h, {
        fontSize: '13px', fontFamily: 'monospace', color: '#374151',
      }).setOrigin(0.5);
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 18, 'v1.0', {
      fontSize: '11px', fontFamily: 'monospace', color: '#1e293b',
    }).setOrigin(0.5);
  }

  private makeBtn(
    x: number, y: number, label: string, secondary: boolean,
    snd: SoundManager, cb: () => void,
  ): void {
    const w = 220, h = 48;
    const g = this.add.graphics();
    const draw = (hover: boolean) => {
      g.clear();
      if (secondary) {
        g.fillStyle(hover ? 0x1e293b : 0x0f172a);
        g.lineStyle(1, hover ? 0x475569 : 0x1e293b, 0.6);
      } else {
        g.fillStyle(hover ? 0x1d4ed8 : 0x1e293b);
        g.lineStyle(1, hover ? 0x60a5fa : 0x334155, 0.6);
      }
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    };
    draw(false);

    const txt = this.add.text(x, y, label, {
      fontSize: secondary ? '15px' : '18px',
      fontFamily: 'monospace', fontStyle: 'bold',
      color: secondary ? '#94a3b8' : '#e2e8f0',
    }).setOrigin(0.5);

    const hit = this.add.rectangle(x, y, w, h, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      draw(true);
      txt.setColor('#fbbf24');
      snd.buttonHover();
    });
    hit.on('pointerout', () => {
      draw(false);
      txt.setColor(secondary ? '#94a3b8' : '#e2e8f0');
    });
    hit.on('pointerdown', () => { snd.buttonClick(); cb(); });
  }
}
