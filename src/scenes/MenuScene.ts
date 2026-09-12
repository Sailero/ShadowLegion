import Phaser from 'phaser';
import { getStage } from '../data/stages';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { RunCheckpointManager } from '../systems/RunCheckpointManager';
import { button, heading, label, menuEntry, openSettings, paintedBackground, shortcut, UI } from '../ui/theme';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }
  create() {
    CampaignProgressionManager.reconcilePendingRewards();
    const state = MetaProgressionManager.getState();
    const campaign = CampaignProgressionManager.getState();
    const completed = Object.values(campaign.stageResults).filter(record => record.stars > 0).length;
    const checkpoint = RunCheckpointManager.load();
    paintedBackground(this, 'cover');
    label(this, 67, 88, 'SUNLIT ECHOES', 13, UI.green, true).setLetterSpacing(5);
    heading(this, 62, 121, '暖影同行', 61, UI.green).setLetterSpacing(4).setStroke('#fff1d5', 1);
    label(this, 70, 208, '借地形守住营地，选卡搭出拿手打法。\n记住你习惯的影伴，帮你照看另一条路。', 16, UI.ink).setLineSpacing(8).setStroke('#fff2d8', 2);
    menuEntry(this, 69, 302, '01', '展开旅行地图', '动作守营 · 五个章节，五十段小旅途', () => this.scene.start('CampaignScene'), true);
    menuEntry(this, 69, 391, '02', '去往更远的地方', '无尽漫游 · 让流派与勇气继续成长', () => this.scene.start('LoadoutScene', { mode: 'endless' }));
    menuEntry(this, 69, 480, '03', '和昨天的自己切磋', '影子试炼 · 五种挑战，读懂自己的习惯', () => this.scene.start('LoadoutScene', { mode: 'shadow', trialTier: 1 }));
    button(this, 161, 608, 208, '旅人行囊与工坊', () => this.scene.start('WorkshopScene'), { secondary: true, height: 43, size: 14 });
    button(this, 342, 608, 112, '旅途设置', () => openSettings(this), { secondary: true, height: 43, size: 13 });
    if (checkpoint) {
      const mode = checkpoint.mode ?? (checkpoint.endless ? 'endless' : 'campaign');
      const resumeName = mode === 'campaign'
        ? `${getStage(checkpoint.stageId ?? (checkpoint.level - 1) * 10 + 1).label} 的旅途`
        : mode === 'shadow' ? `影子试炼 · 第 ${checkpoint.trialTier ?? 1} 封` : `无尽漫游 · 第 ${checkpoint.level} 站`;
      button(this, 228, 672, 342, `续写 ${resumeName}  →`, () => this.scene.start('ArenaScene', { resumeCheckpoint: true }), { height: 42, size: 14 });
      label(this, 228, 704, mode === 'campaign' ? '从本关出发点恢复' : mode === 'shadow' ? '从本次试炼出发点恢复' : '从本站出发点恢复', 11, UI.muted).setOrigin(.5, 0);
    }
    const bar = this.add.graphics();
    bar.fillStyle(UI.card, .9).fillRect(0, 727, 1024, 41);
    label(this, 33, 740, `已送达 ${completed}/50 封信    ·    星章 ${campaign.totalStars}/150    ·    暖晶 ${state.shadowCores}`, 12, UI.ink);
    label(this, 991, 740, '本机保存  /  TAB 选择 · ENTER 确认', 11, UI.muted).setOrigin(1, 0);
    shortcut(this, 'S', () => openSettings(this));
  }
}
