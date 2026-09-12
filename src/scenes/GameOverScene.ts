import Phaser from 'phaser';
import { WAVE_CFG } from '../config/gameConfig';
import { ScoreManager } from '../systems/ScoreManager';
import { BUILD_INFO, BuildPath } from '../data/upgrades';
import type { CombatProfile } from '../systems/RunRecorder';
import { MetaProgressionManager, RunReward } from '../systems/MetaProgressionManager';
import { getOperative, OperativeId } from '../data/operatives';
import { CHAPTERS } from '../data/chapters';
import { backdrop, button, label, paperCard, shortcut, UI } from '../ui/theme';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data: {
    score?: number; kills?: number; wave?: number; level?: number; victory?: boolean; endless?: boolean;
    durationSec?: number; build?: BuildPath | null; newHighScore?: boolean;
    profile?: CombatProfile | null; reward?: RunReward | null; defeatReason?: string; operativeId?: OperativeId;
    shadowTrial?: boolean; startLevel?: number;
  }) {
    const { score = 0, kills = 0, wave = 0, level = 1, victory = false, endless = false,
      durationSec = 0, build = null, newHighScore = false, profile = null, reward = null,
      defeatReason = '旅途暂歇', operativeId = 'ranger', shadowTrial = false, startLevel = 1 } = data;
    const state = MetaProgressionManager.getState();
    const nextChapter = CHAPTERS[Math.min(3, state.highestChapterUnlocked - 1)];
    backdrop(this, '同行日记  /  EVERY TRIP LEAVES AN ECHO');
    label(this, 48, 100, victory ? '这一程，守护成功！' : '歇一歇，下次一起走更远。', victory ? 37 : 32, UI.ink, true);
    const reason = defeatReason.includes('阵亡') || defeatReason.includes('击败') ? '体力耗尽' : defeatReason;
    label(this, 50, 155, victory ? '营地又多了一段好故事。新的流派与新的影子，等你下次出发。' : `${reason}  ·  这次的收获和战斗习惯，都会成为下次的准备。`, 14, UI.muted);
    if (newHighScore && score > 0) {
      paperCard(this, 884, 120, 180, 49, 0xf4e1be);
      label(this, 884, 120, '✦  创下新纪录', 15, UI.ink, true).setOrigin(0.5);
    }

    const stats = [
      { title: '本次积分', value: ScoreManager.formatScore(score) },
      { title: '击退捣蛋鬼', value: String(kills) },
      { title: '同行时间', value: `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` },
      { title: '旅途进度', value: endless ? `第 ${level} 站 · ${wave} 波` : victory ? (startLevel === 1 ? '4 章 · 全部完成' : `第 ${startLevel}–${level} 章完成`) : `${Math.min(4, level)} 章 · ${Math.min(wave, WAVE_CFG.perLevel)}/${WAVE_CFG.perLevel} 波` },
    ];
    stats.forEach((stat, index) => {
      const x = 157 + index * 237;
      paperCard(this, x, 250, 220, 103);
      label(this, x, 221, stat.title, 12, UI.muted).setOrigin(0.5);
      label(this, x, 261, stat.value, index === 3 ? 20 : 29, UI.ink, true).setOrigin(0.5);
    });

    paperCard(this, 275, 437, 457, 219);
    label(this, 68, 347, '带回营地的收获', 15, UI.ink, true);
    label(this, 70, 389, `+${reward?.earned ?? 0}`, 44, UI.green, true);
    label(this, 184, 410, '暖晶', 17, UI.green, true);
    label(this, 70, 454, `进度 ${reward?.progressReward ?? 0}  +  通关 ${reward?.victoryReward ?? 0}  +  新流派 ${reward?.newBuildReward ?? 0}`, 13, UI.muted);
    label(this, 70, 487, `口袋里共有 ${reward?.total ?? state.shadowCores} 暖晶，可在工坊永久升级。`, 13, UI.muted);
    label(this, 70, 517, reward?.newBuildClear ? '新流派首次通关，额外的暖晶也收好啦。' : '抵达更多波次，也能积累下一局的准备。', 11, UI.green);

    paperCard(this, 750, 437, 453, 219, 0xeaf0e2);
    label(this, 545, 347, '留给下一次的影子', 15, UI.ink, true);
    this.add.image(568, 410, 'hero').setTint(0x95b5a2).setAlpha(0.8).setScale(1.35);
    label(this, 605, 385, profile?.style ?? '见习伙伴', 24, UI.green, true);
    label(this, 605, 421, '下次，它会带着这次的习惯同行。', 12, UI.muted);
    const metrics = [
      { name: '移动', value: profile?.mobility ?? 0 }, { name: '火力', value: profile?.firepower ?? 0 },
      { name: '闪避', value: profile?.reflex ?? 0 }, { name: '技能', value: profile?.technique ?? 0 },
    ];
    metrics.forEach((metric, index) => {
      const x = 546 + index * 104;
      label(this, x, 466, `${metric.name} ${metric.value}`, 12, UI.ink);
      this.add.rectangle(x, 495, 84, 6, 0xd3dec8).setOrigin(0, 0.5);
      if (metric.value > 0) this.add.rectangle(x, 495, 84 * Math.min(100, metric.value) / 100, 6, UI.green).setOrigin(0, 0.5);
    });
    label(this, 546, 518, '这些数值表示行为偏好，不是能力评分。', 11, UI.muted);

    const recommendation = victory ? `试试另一种流派，或开启镜像切磋，挑战昨天的自己。`
      : /营地|防线|据点|暖灯/.test(defeatReason) ? '下次试试：靠近营地截击，优先处理向帐篷推进的捣蛋鬼。'
      : (profile?.reflex ?? 0) < 25 ? '下次试试：用 SHIFT 闪避穿过包围，技能充满后按 SPACE。'
      : '下次试试：借树丛挡住弹幕，升级时围绕同一流派形成连锁。';
    label(this, 50, 573, recommendation, 14, UI.green, true).setWordWrapWidth(930, true);
    const buildName = build ? BUILD_INFO[build]?.name : getOperative(operativeId).name;
    label(this, 50, 614, `本次流派 · ${buildName}    /    下一站 · ${nextChapter.name}    /    本设备最高分 · ${ScoreManager.formatScore(ScoreManager.getHighScore())}`, 12, UI.muted);

    const retryData = { level: victory ? 1 : level, endless, operativeId, freshRun: true, shadowTrial };
    button(this, 215, 696, 336, victory ? '再启一程  ·  R' : '再试一次  ·  R', () => this.scene.start('ArenaScene', retryData), { height: 53, size: 17 });
    button(this, 541, 696, 275, '去工坊种下收获', () => this.scene.start('WorkshopScene'), { secondary: true, height: 53 });
    button(this, 838, 696, 275, '调整伙伴与路线', () => this.scene.start('LoadoutScene', { endless, operativeId, chapter: Math.min(level, state.highestChapterUnlocked), shadowTrial }), { secondary: true, height: 53 });
    label(this, 512, 748, 'R 快速重试  ·  ESC 返回营地  ·  进度与暖晶已自动记录', 11, UI.muted).setOrigin(0.5);
    shortcut(this, 'R', () => this.scene.start('ArenaScene', retryData));
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }
}
