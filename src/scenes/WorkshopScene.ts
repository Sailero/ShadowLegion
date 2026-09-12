import Phaser from 'phaser';
import { SoundManager } from '../systems/SoundManager';
import { MetaProgressionManager, WORKSHOP_MAX_RANK, WORKSHOP_MODULES,
  WorkshopModuleId, workshopUpgradeCost } from '../systems/MetaProgressionManager';
import { CHAPTERS } from '../data/chapters';
import { OPERATIVES } from '../data/operatives';
import { backdrop, button, drawFlower, label, paperCard, shortcut, UI } from '../ui/theme';
import { openPlaytestRecords } from '../ui/playtestRecords';

export class WorkshopScene extends Phaser.Scene {
  private notice = '';
  constructor() { super('WorkshopScene'); }
  init(data: { notice?: string } = {}) { this.notice = data.notice ?? ''; }

  create() {
    const state = MetaProgressionManager.getState();
    const level = MetaProgressionManager.getWorkshopLevel(state);
    const bonuses = MetaProgressionManager.getBonuses(state);
    backdrop(this, '营地工坊  /  LITTLE THINGS GROW');
    button(this, 754, 39, 145, '查看试玩记录', () => openPlaytestRecords(this), { secondary: true, height: 34, size: 12 });
    button(this, 914, 39, 135, '返回营地  ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 34, size: 12 });
    label(this, 45, 96, '把旅途收获，种进明天。', 31, UI.ink, true);
    label(this, 47, 147, '暖晶来自冒险进度与通关。升级永久保留，每项最多 5 级。', 14, UI.muted);
    paperCard(this, 842, 133, 271, 75, 0xf4e2c5);
    label(this, 731, 111, '口袋里的暖晶', 11, UI.muted);
    label(this, 952, 120, String(state.shadowCores), 30, UI.ink, true).setOrigin(1, 0);
    label(this, 731, 135, `营地成长 ${level}/15`, 13, UI.green, true);

    const accents = [0xf0d4ac, 0xdce7ca, 0xe1d9e9];
    WORKSHOP_MODULES.forEach((module, index) => {
      const x = 196 + index * 316;
      const rank = state.modules[module.id];
      const cost = workshopUpgradeCost(rank);
      const canBuy = rank < WORKSHOP_MAX_RANK && state.shadowCores >= cost;
      paperCard(this, x, 359, 298, 313);
      this.add.circle(x, 249, 29, accents[index]);
      const icon = this.add.graphics();
      if (index === 0) drawFlower(icon, x, 249, 18, UI.amber);
      else if (index === 1) {
        icon.fillStyle(UI.green).fillRoundedRect(x - 12, 233, 24, 28, 8);
        icon.fillStyle(0xfaf1d2).fillRect(x - 2, 239, 4, 15).fillRect(x - 7, 244, 14, 4);
      } else {
        icon.fillStyle(0x9783aa).fillRoundedRect(x - 11, 236, 22, 27, 6);
        icon.fillStyle(0xdccbb0).fillRoundedRect(x - 8, 231, 16, 7, 2);
        icon.fillStyle(0xfff3c9).fillTriangle(x + 3, 239, x - 5, 250, x + 5, 248);
        icon.fillTriangle(x - 3, 259, x + 5, 248, x - 5, 250);
      }
      label(this, x, 290, module.name, 22, UI.ink, true).setOrigin(0.5);
      label(this, x, 328, module.desc, 13, UI.muted).setOrigin(0.5);
      label(this, x, 358, module.perRank, 14, UI.green, true).setOrigin(0.5);
      const pips = this.add.graphics();
      for (let i = 0; i < WORKSHOP_MAX_RANK; i++) {
        pips.fillStyle(i < rank ? UI.green : UI.line).fillRoundedRect(x - 65 + i * 28, 391, 18, 9, 4);
      }
      label(this, x, 420, `当前 ${rank} / ${WORKSHOP_MAX_RANK} 级`, 11, UI.muted).setOrigin(0.5);
      const text = rank >= WORKSHOP_MAX_RANK ? '已经长得很茂盛了 ✓' : canBuy ? `升级  ·  ${cost} 暖晶` : `还差 ${cost - state.shadowCores} 暖晶`;
      button(this, x, 472, 246, text, () => this.buyModule(module.id), { disabled: !canBuy, size: 14, height: 43 });
    });

    const nextChapter = CHAPTERS[Math.min(3, state.highestChapterUnlocked - 1)];
    const nextOperative = OPERATIVES.find(item => !state.unlockedOperatives.includes(item.id));
    paperCard(this, 512, 590, 931, 103, 0xe9eddc);
    label(this, 67, 556, this.notice || '下一份期待', 15, UI.green, true);
    label(this, 67, 585, nextOperative
      ? `通关 ${nextChapter.name}，邀请${nextOperative.name}加入你的旅途。`
      : '伙伴已全部加入。换个流派通关，或在镜像切磋中读懂自己的习惯。', 14, UI.ink);
    label(this, 67, 614, `当前增幅：伤害 +${Math.round((bonuses.damageMult - 1) * 100)}%  ·  生命 +${bonuses.maxHpBonus}  ·  初始能量 +${bonuses.startCharge}`, 12, UI.muted);
    label(this, 50, 675, `已出发 ${state.totalRuns} 次  ·  通关 ${state.wins} 次  ·  探索 ${state.clearedChapters.length}/4 章`, 12, UI.muted);
    label(this, 50, 707, '工坊增幅有限，地形选择和局内搭配会带来更多可能。', 12, UI.muted);
    button(this, 814, 702, 325, '带上新装备，继续出发  →', () => this.scene.start('LoadoutScene', { chapter: state.highestChapterUnlocked }), { height: 50 });
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }

  private buyModule(id: WorkshopModuleId): void {
    if (!MetaProgressionManager.purchase(id)) return;
    SoundManager.get().upgrade();
    const name = WORKSHOP_MODULES.find(module => module.id === id)?.name ?? '装备';
    this.scene.restart({ notice: `${name}已升级，下次出发就能带上。` });
  }
}
