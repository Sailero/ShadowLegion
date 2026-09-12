import Phaser from 'phaser';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { RunCheckpointManager } from '../systems/RunCheckpointManager';
import { CHAPTERS, getChapter } from '../data/chapters';
import { backdrop, button, gardenPostcard, label, openSettings, paperCard, shortcut, UI } from '../ui/theme';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const state = MetaProgressionManager.getState();
    const checkpoint = RunCheckpointManager.load();
    const chapter = CHAPTERS[Math.min(CHAPTERS.length - 1, state.highestChapterUnlocked - 1)];
    backdrop(this, 'SUNLIT ECHOES  /  暖影同行');
    label(this, 636, 33, '一人出发，也有自己作伴。', 12, UI.muted);
    button(this, 920, 40, 125, '旅途设置', () => openSettings(this), { secondary: true, height: 34, size: 12 });
    label(this, 46, 104, '暖影同行', 54, UI.ink, true).setLetterSpacing(3);
    label(this, 48, 179, '把昨天的自己，\n变成今天的队友。', 26, UI.green, true).setLineSpacing(9);
    label(this, 49, 266, '守住小小营地，搭出自己的技能流派。\n让会记住你习惯的影子，一起应对下一场挑战。', 14, UI.muted).setLineSpacing(9);
    if (checkpoint) {
      button(this, 187, 349, 276, `继续第 ${checkpoint.level} ${checkpoint.endless ? '站' : '章'}的旅途  →`,
        () => this.scene.start('ArenaScene', { resumeCheckpoint: true }), { height: 54, size: 17 });
      label(this, 50, 386, `${getChapter(checkpoint.level, checkpoint.endless).name} · 从本章出发点恢复`, 12, UI.muted);
      button(this, 187, 425, 276, '重新安排伙伴与路线', () => this.scene.start('LoadoutScene', { chapter: state.highestChapterUnlocked }), { secondary: true, height: 34, size: 13 });
    } else {
      button(this, 187, 366, 276, state.totalRuns > 0 ? '安排下一段旅途  →' : '开启第一段旅途  →', () => {
        this.scene.start('LoadoutScene', { endless: false, chapter: state.highestChapterUnlocked });
      }, { height: 54, size: 17 });
      label(this, 50, 405, state.totalRuns > 0 ? `下一站 · ${chapter.name}` : '从第一章开始，边玩边学。', 12, UI.muted);
    }
    button(this, 111, checkpoint ? 467 : 455, 125, '营地工坊', () => this.scene.start('WorkshopScene'), { secondary: true, height: 34, size: 13 });
    button(this, 253, checkpoint ? 467 : 455, 125, '无尽漫游', () => this.scene.start('LoadoutScene', { endless: true }), { secondary: true, height: 34, size: 13 });
    gardenPostcard(this, 441, 102, 535, 370);
    label(this, 47, 499, '每一次出发，都给下一次留下点什么', 14, UI.ink, true);
    const ideas = [
      { number: '01', title: '地形就是你的帮手', body: '借树丛挡弹，绕过流沙与潮汐。\n守住营地，也为自己留一条退路。', color: UI.pale },
      { number: '02', title: '小技能，搭出大连锁', body: '机动爆发、连射、控场或蜂群。\n升级时三选一，逐步养成你的流派。', color: 0xf5e3cb },
      { number: '03', title: '和昨天的自己合作', body: '按 E 安排影子同行或守营。\n也能开启镜像切磋，试试如何破招。', color: UI.lilac },
    ];
    ideas.forEach((idea, index) => {
      const x = 197 + index * 315;
      paperCard(this, x, 597, 299, 134);
      this.add.circle(x - 122, 558, 14, idea.color);
      label(this, x - 122, 558, idea.number, 11, UI.ink, true).setOrigin(0.5);
      label(this, x - 97, 547, idea.title, 15, UI.ink, true);
      label(this, x - 131, 584, idea.body, 13, UI.muted).setLineSpacing(9);
    });
    paperCard(this, 512, 706, 932, 46, 0xe9eddc);
    const shadow = state.lastProfile ? `${state.lastProfile.style}影子已准备同行` : '见习影子在营地等你';
    label(this, 65, 696, `暖晶 ${state.shadowCores}    ·    已探索 ${state.clearedChapters.length}/4 章    ·    伙伴 ${state.unlockedOperatives.length}/4`, 12, UI.ink);
    label(this, 954, 696, shadow, 12, UI.green, true).setOrigin(1, 0);
    label(this, 512, 749, 'PC 浏览器版  ·  WASD 移动 / 鼠标瞄准  ·  TAB 选择 / ENTER 确认  ·  进度保存在本设备', 11, UI.muted).setOrigin(0.5);
    shortcut(this, 'S', () => openSettings(this));
  }
}
