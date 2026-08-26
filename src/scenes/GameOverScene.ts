import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, WAVE_CFG } from '../config/gameConfig';
import { SoundManager } from '../systems/SoundManager';
import { ScoreManager } from '../systems/ScoreManager';
import type { BuildPath } from '../data/upgrades';
import type { CombatProfile } from '../systems/RunRecorder';
import type { RunReward } from '../systems/MetaProgressionManager';
import { getOperative, OperativeId } from '../data/operatives';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data: {
    score?: number; kills?: number; wave?: number;
    level?: number; victory?: boolean; endless?: boolean;
    durationSec?: number; build?: BuildPath | null; newHighScore?: boolean;
    profile?: CombatProfile | null; reward?: RunReward | null;
    defeatReason?: string; operativeId?: OperativeId;
  }) {
    const {
      score = 0, kills = 0, wave = 0, level = 1,
      victory = false, endless = false, durationSec = 0,
      build = null, newHighScore = false, profile = null, reward = null,
      defeatReason = '阵亡', operativeId = 'ranger',
    } = data;
    const snd = SoundManager.get();
    this.cameras.main.setBackgroundColor(0x080c14);

    const isNew = newHighScore;

    const glow = this.add.graphics();
    for (let r = 180; r > 0; r -= 25) {
      glow.fillStyle(victory ? 0x0a2a1a : 0x2a0a0a, 0.025);
      glow.fillCircle(GAME_WIDTH / 2, 110, r);
    }

    const titleStr = victory ? '战 役 胜 利' : defeatReason;
    const titleColor = victory ? '#4ade80' : '#f87171';
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.14, titleStr, {
      fontSize: '52px', fontFamily: 'monospace', fontStyle: 'bold', color: titleColor,
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);
    this.tweens.add({
      targets: title, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 500, ease: 'Back.easeOut',
    });

    if (isNew && score > 0) {
      const badge = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.21, '🏆 新纪录!', {
        fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({
        targets: badge, alpha: 1, y: GAME_HEIGHT * 0.21 - 2, duration: 400,
        delay: 500, ease: 'Cubic.easeOut',
      });
      this.tweens.add({
        targets: badge, alpha: { from: 1, to: 0.6 },
        duration: 800, yoyo: true, repeat: -1, delay: 1000,
      });
    }

    const stats = [
      { label: '分数', value: ScoreManager.formatScore(score), color: '#fbbf24' },
      { label: '击杀', value: `${kills}`, color: '#4ade80' },
      { label: '用时', value: `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`, color: '#60a5fa' },
      { label: '兵种', value: getOperative(operativeId).name, color: `#${getOperative(operativeId).color.toString(16).padStart(6, '0')}` },
    ];

    const statsY = GAME_HEIGHT * 0.28;
    const statsGap = 130;
    const startX = GAME_WIDTH / 2 - statsGap * 1.5;

    stats.forEach((s, i) => {
      const sx = startX + i * statsGap;
      const val = this.add.text(sx, statsY, s.value, {
        fontSize: '30px', fontFamily: 'monospace', fontStyle: 'bold', color: s.color,
      }).setOrigin(0.5).setAlpha(0);
      this.add.text(sx, statsY + 30, s.label, {
        fontSize: '12px', fontFamily: 'monospace', color: '#64748b',
      }).setOrigin(0.5);
      this.tweens.add({
        targets: val, alpha: 1, y: statsY - 2,
        duration: 350, delay: 300 + i * 120, ease: 'Cubic.easeOut',
      });
    });

    this.add.rectangle(GAME_WIDTH / 2, statsY + 52, 240, 1, 0x1e293b).setOrigin(0.5);

    const scores = ScoreManager.getScores();
    if (scores.length > 0) {
      const boardY = statsY + 72;
      this.add.text(GAME_WIDTH / 2, boardY, '排行榜', {
        fontSize: '13px', fontFamily: 'monospace', color: '#475569',
      }).setOrigin(0.5);
      const top5 = scores.slice(0, 5);
      top5.forEach((entry, i) => {
        const ey = boardY + 22 + i * 20;
        const isThisRun = entry.score === score && entry.kills === kills && entry.level === level;
        this.add.text(GAME_WIDTH / 2 - 100, ey, `${i + 1}.`, {
          fontSize: '12px', fontFamily: 'monospace',
          color: isThisRun ? '#fbbf24' : '#475569',
        });
        this.add.text(GAME_WIDTH / 2 - 75, ey, ScoreManager.formatScore(entry.score), {
          fontSize: '12px', fontFamily: 'monospace', fontStyle: 'bold',
          color: isThisRun ? '#fbbf24' : '#94a3b8',
        });
        this.add.text(GAME_WIDTH / 2 + 35, ey, entry.endless ? `∞${entry.level}` : `${entry.level}-${entry.wave}/${WAVE_CFG.perLevel}`, {
          fontSize: '12px', fontFamily: 'monospace',
          color: '#475569',
        });
        this.add.text(GAME_WIDTH / 2 + 90, ey, `${entry.kills}K`, {
          fontSize: '12px', fontFamily: 'monospace',
          color: '#475569',
        });
      });
    }

    const panelY = 515;
    const panelW = 330;
    const panelH = 112;
    const drawPanel = (x: number, color: number) => {
      const panel = this.add.graphics();
      panel.fillStyle(0x0f172a, 0.96);
      panel.fillRoundedRect(x - panelW / 2, panelY - panelH / 2, panelW, panelH, 10);
      panel.lineStyle(1, color, 0.55);
      panel.strokeRoundedRect(x - panelW / 2, panelY - panelH / 2, panelW, panelH, 10);
    };

    const rewardX = GAME_WIDTH / 2 - 180;
    drawPanel(rewardX, 0xfbbf24);
    this.add.text(rewardX, panelY - 31, '本局回收', {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5);
    this.add.text(rewardX, panelY, reward ? `+${reward.earned} 影核` : '+0 影核', {
      fontSize: '24px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
    }).setOrigin(0.5);
    const rewardHint = reward?.newBuildClear
      ? `新协议首胜奖励  ·  库存 ${reward.total}`
      : `进度与胜利都会积累  ·  库存 ${reward?.total ?? 0}`;
    this.add.text(rewardX, panelY + 32, rewardHint, {
      fontSize: '11px', fontFamily: 'monospace', color: '#64748b',
    }).setOrigin(0.5);

    const profileX = GAME_WIDTH / 2 + 180;
    drawPanel(profileX, 0x818cf8);
    this.add.text(profileX, panelY - 31, '影子行为档案', {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5);
    this.add.text(profileX, panelY - 2, profile?.style ?? '等待记录', {
      fontSize: '22px', fontFamily: 'monospace', fontStyle: 'bold', color: '#a78bfa',
    }).setOrigin(0.5);
    this.add.text(
      profileX, panelY + 31,
      profile
        ? `机动 ${profile.mobility}  火力 ${profile.firepower}  反应 ${profile.reflex}  技能 ${profile.technique}`
        : '完成一次有效突围后生成',
      { fontSize: '11px', fontFamily: 'monospace', color: '#64748b' },
    ).setOrigin(0.5);

    const retryData = { level: victory ? 1 : level, endless, operativeId, freshRun: true };
    const btnY = 680;
    this.makeBtn(GAME_WIDTH / 2 - 220, btnY, '再来一次', false, snd, () => {
      this.scene.start('ArenaScene', retryData);
    });
    this.makeBtn(GAME_WIDTH / 2, btnY, '军团工坊', true, snd, () => {
      this.scene.start('WorkshopScene');
    });
    this.makeBtn(GAME_WIDTH / 2 + 220, btnY, '返回菜单', true, snd, () => {
      this.scene.start('MenuScene');
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, '按 R 快速重试', {
      fontSize: '12px', fontFamily: 'monospace', color: '#1e293b',
    }).setOrigin(0.5);

    this.input.keyboard!.once('keydown-R', () => {
      this.scene.start('ArenaScene', retryData);
    });
  }

  private makeBtn(
    x: number, y: number, label: string, dim: boolean,
    snd: SoundManager, cb: () => void,
  ): void {
    const w = 200, h = 46;
    const bg = dim ? 0x111827 : 0x1d4ed8;
    const hov = dim ? 0x1e293b : 0x2563eb;
    const g = this.add.graphics();
    const draw = (c: number) => {
      g.clear();
      g.fillStyle(c);
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      g.lineStyle(1, dim ? 0x334155 : 0x3b82f6, 0.5);
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    };
    draw(bg);
    const t = this.add.text(x, y, label, {
      fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, w, h, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { draw(hov); t.setColor('#fbbf24'); snd.buttonHover(); });
    hit.on('pointerout', () => { draw(bg); t.setColor('#e2e8f0'); });
    hit.on('pointerdown', () => { snd.buttonClick(); cb(); });
  }
}
