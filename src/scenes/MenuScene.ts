import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { SoundManager } from '../systems/SoundManager';
import { ScoreManager } from '../systems/ScoreManager';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';

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

    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18, 'SHADOW LEGION', {
      fontSize: '44px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18 + 50, '四章攻防战役 · 兵种解锁 · 肉鸽火力构筑', {
      fontSize: '16px', fontFamily: 'monospace', color: '#64748b',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, y: title.y - 10, duration: 600, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, y: sub.y - 10, duration: 600, ease: 'Cubic.easeOut', delay: 150 });

    const line = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.18 + 78, 100, 1, 0x3b82f6, 0.5).setOrigin(0.5);
    this.tweens.add({ targets: line, scaleX: { from: 0, to: 1 }, duration: 500, delay: 300 });

    const high = ScoreManager.getHighScore();
    if (high > 0) {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.31, `最高分 ${ScoreManager.formatScore(high)}`, {
        fontSize: '16px', fontFamily: 'monospace', color: '#fbbf24',
      }).setOrigin(0.5);
    }

    const promises = [
      { value: '4', label: '章特色地图', color: '#60a5fa' },
      { value: '4', label: '类可解锁兵种', color: '#fbbf24' },
      { value: '20', label: '波攻防战斗', color: '#f87171' },
    ];
    promises.forEach((item, index) => {
      const x = GAME_WIDTH / 2 + (index - 1) * 145;
      this.add.text(x, GAME_HEIGHT * 0.39, item.value, {
        fontSize: '26px', fontFamily: 'monospace', fontStyle: 'bold', color: item.color,
      }).setOrigin(0.5);
      this.add.text(x, GAME_HEIGHT * 0.39 + 28, item.label, {
        fontSize: '12px', fontFamily: 'monospace', color: '#475569',
      }).setOrigin(0.5);
    });

    const meta = MetaProgressionManager.getState();
    const workshopLevel = MetaProgressionManager.getWorkshopLevel(meta);
    const profileText = meta.lastProfile ? `  ·  最近影子 ${meta.lastProfile.style}` : '';
    this.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT * 0.47,
      `◆ 影核 ${meta.shadowCores}  ·  工坊 ${workshopLevel}/15  ·  章节 ${meta.clearedChapters.length}/4  ·  兵种 ${meta.unlockedOperatives.length}/4${profileText}`,
      { fontSize: '13px', fontFamily: 'monospace', color: '#a78bfa' },
    ).setOrigin(0.5);

    this.makeBtn(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, '开始突围', false, snd, () => {
      this.scene.start('LoadoutScene', { endless: false });
    });

    this.makeBtn(GAME_WIDTH / 2, GAME_HEIGHT * 0.55 + 58, '无尽演练', true, snd, () => {
      this.scene.start('LoadoutScene', { endless: true });
    });

    this.makeBtn(GAME_WIDTH / 2, GAME_HEIGHT * 0.55 + 116, '军团工坊', true, snd, () => {
      this.scene.start('WorkshopScene');
    });

    const hints = [
      'WASD 移动  |  鼠标瞄准 / 左键射击  |  SHIFT 或右键闪避',
      'SPACE 释放技能  |  Q 切换技能  |  ESC 暂停',
    ];
    hints.forEach((h, i) => {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.84 + i * 22, h, {
        fontSize: '13px', fontFamily: 'monospace', color: '#374151',
      }).setOrigin(0.5);
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 18, 'Chapter Campaign Demo · v1.1.0', {
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
