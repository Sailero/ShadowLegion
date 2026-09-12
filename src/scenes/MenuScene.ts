import Phaser from 'phaser';
import { getStage } from '../data/stages';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { RunCheckpointManager } from '../systems/RunCheckpointManager';
import { PostalJourneyManager } from '../systems/PostalJourneyManager';
import { JourneyProgressManager } from '../systems/JourneyProgressManager';
import { button, heading, label, menuEntry, openSettings, paintedBackground, shortcut, UI } from '../ui/theme';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }
  create() {
    CampaignProgressionManager.reconcilePendingRewards();
    const state = MetaProgressionManager.getState();
    const campaign = CampaignProgressionManager.getState();
    const checkpoint = RunCheckpointManager.load();
    const postal = PostalJourneyManager.getState();
    const journey = JourneyProgressManager.getState();
    paintedBackground(this, 'cover');
    label(this, 67, 88, 'SUNLIT ECHOES', 13, UI.green, true).setLetterSpacing(5);
    heading(this, 62, 121, '暖影同行', 61, UI.green).setLetterSpacing(4).setStroke('#fff1d5', 1);
    label(this, 70, 208, '小猫棉棉，今天也把心意送往远方。\n和记住你脚步的小暖，一起走过下一段路。', 16, UI.ink).setLineSpacing(8).setStroke('#fff2d8', 2);
    menuEntry(this, 69, 302, '01', journey.deliveries.mountain ? '带着回信，再去远方' : journey.deliveries.lake ? '下一封，寄往云阶山' : journey.deliveries.forest || postal.deliveryCompleted ? '下一封，寄往圆镜湖' : '今天，寄往风铃森林', '打开邮路图 · 读懂地址，选一条路，和小暖亲手送达', () => this.scene.start('JourneyMapScene'), true);
    menuEntry(this, 69, 391, '02', '邮路上的小练习', '地形、邮装与营地 · 练一练默契和身手', () => this.scene.start('CampaignScene'));
    menuEntry(this, 69, 480, '03', '和昨天的自己切磋', '影子试炼 · 五种挑战，读懂自己的习惯', () => this.scene.start('LoadoutScene', { mode: 'shadow', trialTier: 1 }));
    button(this, 161, 578, 208, '棉棉的行囊与工坊', () => this.scene.start('WorkshopScene'), { secondary: true, height: 36, size: 14 });
    button(this, 342, 578, 112, '旅途设置', () => openSettings(this), { secondary: true, height: 36, size: 13 });
    button(this, 161, 622, 208, '翻开回信册', () => this.scene.start('LetterBookScene'), { secondary: true, height: 36, size: 13 });
    button(this, 342, 622, 112, '无尽漫游', () => this.scene.start('LoadoutScene', { mode: 'endless' }), { secondary: true, height: 36, size: 13 });
    if (checkpoint) {
      const mode = checkpoint.mode ?? (checkpoint.endless ? 'endless' : 'campaign');
      const resumeName = mode === 'campaign'
        ? `${getStage(checkpoint.stageId ?? (checkpoint.level - 1) * 10 + 1).label} 的旅途`
        : mode === 'shadow' ? `影子试炼 · 第 ${checkpoint.trialTier ?? 1} 封` : `无尽漫游 · 第 ${checkpoint.level} 站`;
      button(this, 228, 680, 342, `继续练习 ${resumeName}  →`, () => this.scene.start('ArenaScene', { resumeCheckpoint: true }), { height: 42, size: 14 });
      label(this, 228, 711, mode === 'campaign' ? '从本段练习起点恢复' : mode === 'shadow' ? '从本次试炼出发点恢复' : '从本站出发点恢复', 11, UI.muted).setOrigin(.5, 0);
    }
    const bar = this.add.graphics();
    bar.fillStyle(UI.card, .9).fillRect(0, 727, 1024, 41);
    label(this, 33, 740, `森林来信 ${postal.deliveryCompleted ? '已送达' : `${postal.foundAddressIds.length}/3 地址线索`}    ·    练习星章 ${campaign.totalStars}    ·    暖晶 ${state.shadowCores}`, 12, UI.ink);
    label(this, 991, 740, '本机保存  /  TAB 选择 · ENTER 确认', 11, UI.muted).setOrigin(1, 0);
    shortcut(this, 'S', () => openSettings(this));
  }
}
