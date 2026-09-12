import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';
import { ChapterDef, CHAPTERS } from '../data/chapters';
import { getOperative, OPERATIVES, OperativeId } from '../data/operatives';
import { getSkill } from '../data/skills';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { RunCheckpointManager } from '../systems/RunCheckpointManager';
import { backdrop, button, choiceHit, label, paperCard, shortcut, UI } from '../ui/theme';

export class LoadoutScene extends Phaser.Scene {
  private endless = false;
  private selectedOperative: OperativeId = 'ranger';
  private selectedChapter = 1;
  private shadowTrial = false;
  constructor() { super('LoadoutScene'); }

  init(data: { endless?: boolean; operativeId?: OperativeId; chapter?: number; shadowTrial?: boolean }) {
    this.endless = Boolean(data.endless);
    this.selectedOperative = data.operativeId ?? 'ranger';
    this.selectedChapter = data.chapter ?? 1;
    this.shadowTrial = Boolean(data.shadowTrial);
  }

  create() {
    const state = MetaProgressionManager.getState();
    if (!state.unlockedOperatives.includes(this.selectedOperative)) this.selectedOperative = 'ranger';
    this.selectedChapter = Phaser.Math.Clamp(this.selectedChapter, 1, state.highestChapterUnlocked);
    backdrop(this, '准备出发  /  PLAN YOUR TRIP');
    button(this, 914, 39, 135, '返回营地  ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 34, size: 12 });
    label(this, 43, 94, this.endless ? '没有终点的，暖暖漫游。' : '今天，想怎么守护营地？', 30, UI.ink, true);
    label(this, 45, 141, this.endless ? '章节地形循环，难度逐步成长；每一段旅途都能留下暖晶与影子习惯。' : '选一个伙伴、一处风景。波次结束三选一升级，守住营地，解锁下一站。', 14, UI.muted);
    label(this, 45, 183, '01  选择你的起手流派', 14, UI.green, true);
    label(this, 975, 183, '数字 1–4 可快速选择已解锁伙伴', 11, UI.muted).setOrigin(1, 0);
    OPERATIVES.forEach((operative, index) => {
      const x = 157 + index * 237;
      const unlocked = state.unlockedOperatives.includes(operative.id);
      const selected = this.selectedOperative === operative.id;
      paperCard(this, x, 309, 220, 194, selected ? 0xeaf0de : unlocked ? UI.card : 0xefeee5, selected ? UI.green : UI.line);
      this.add.circle(x - 65, 248, 23, unlocked ? 0xe4eacb : 0xe1e1d7);
      this.add.image(x - 65, 248, 'hero').setScale(0.95).setTint(operative.color).setAlpha(unlocked ? 1 : 0.36);
      label(this, x - 30, 230, operative.name, 17, unlocked ? UI.ink : UI.muted, true);
      label(this, x - 30, 257, operative.role, 12, UI.green);
      if (selected) label(this, x + 91, 222, '✓', 14, UI.green, true).setOrigin(1, 0);
      label(this, x - 91, 294, operative.trait, 13, UI.muted).setWordWrapWidth(184, true).setLineSpacing(7);
      const skill = getSkill(operative.signatureSkill);
      label(this, x - 91, 374, unlocked ? `起手技能 · ${skill?.name ?? '支援'}` : `通关第 ${operative.requiredChapter} 章后加入`, 12, unlocked ? UI.green : UI.muted, unlocked);
      if (unlocked) choiceHit(this, x, 309, 220, 194, () => this.refresh({ operativeId: operative.id }));
      shortcut(this, String(index + 1), () => { if (unlocked) this.refresh({ operativeId: operative.id }); });
    });
    label(this, 45, 430, '02  选择出发的风景', 14, UI.green, true);
    CHAPTERS.forEach((chapter, index) => {
      const x = 157 + index * 237;
      const unlocked = chapter.id <= state.highestChapterUnlocked;
      const selected = chapter.id === this.selectedChapter;
      paperCard(this, x, 508, 220, 92, selected ? 0xeaf0de : unlocked ? UI.card : 0xefeee5, selected ? UI.green : UI.line);
      this.miniMap(chapter, x - 94, 479, 69, 54, unlocked);
      label(this, x - 13, 477, `${chapter.id}. ${chapter.name}`, 13, unlocked ? UI.ink : UI.muted, true);
      label(this, x - 13, 501, unlocked ? chapter.specialName : `通关第 ${chapter.id - 1} 章解锁`, 11, UI.muted).setWordWrapWidth(111, true);
      if (selected) label(this, x + 94, 531, '已选择', 10, UI.green, true).setOrigin(1, 0);
      if (unlocked) choiceHit(this, x, 508, 220, 92, () => this.refresh({ chapter: chapter.id }));
    });
    const chapter = CHAPTERS[this.selectedChapter - 1];
    paperCard(this, 512, 604, 932, 64, 0xf2e5cd);
    label(this, 64, 583, `${chapter.name}  ·  地形小贴士`, 13, UI.ink, true);
    label(this, 64, 608, chapter.specialDesc, 13, UI.muted).setWordWrapWidth(880, true);
    const profile = state.lastProfile;
    label(this, 47, 654, profile ? `同行影子 · ${profile.style}（来自上一次旅途）` : '同行影子 · 见习伙伴（首局也有人陪伴）', 12, UI.green, true);
    button(this, 237, 701, 382, `镜像切磋：${this.shadowTrial ? '开启  ✓' : '关闭'}  ·  可选挑战`, () => this.refresh({ shadowTrial: !this.shadowTrial }), { secondary: true, height: 42, size: 13 });
    label(this, 48, 733, this.shadowTrial ? '第 3 波加入模仿战斗习惯的影子对手。' : '首次推荐关闭，先熟悉守护营地与技能组合。', 11, UI.muted);
    button(this, 758, 700, 436, `和${getOperative(this.selectedOperative).name}一起出发  →`, () => this.launch(), { height: 54, size: 17 });
    if (RunCheckpointManager.load()) label(this, 758, 744, '出发后，将替换尚未完成的章节记录。', 11, UI.muted).setOrigin(0.5);
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }

  private refresh(patch: { operativeId?: OperativeId; chapter?: number; shadowTrial?: boolean }): void {
    this.scene.restart({ endless: this.endless, operativeId: this.selectedOperative, chapter: this.selectedChapter, shadowTrial: this.shadowTrial, ...patch });
  }
  private launch(): void {
    this.scene.start('ArenaScene', { level: this.selectedChapter, operativeId: this.selectedOperative,
      endless: this.endless, freshRun: true, shadowTrial: this.shadowTrial });
  }
  private miniMap(chapter: ChapterDef, x: number, y: number, width: number, height: number, unlocked: boolean): void {
    const g = this.add.graphics().setAlpha(unlocked ? 1 : 0.35);
    g.fillStyle(chapter.colors.ground).fillRoundedRect(x, y, width, height, 7);
    const sx = width / ARENA_WIDTH, sy = height / ARENA_HEIGHT;
    chapter.hazards.forEach(rect => g.fillStyle(chapter.colors.hazard, 0.5)
      .fillRect(x + (rect.x - rect.width / 2) * sx, y + (rect.y - rect.height / 2) * sy, rect.width * sx, rect.height * sy));
    chapter.obstacles.forEach(rect => g.fillStyle(chapter.colors.detail)
      .fillRoundedRect(x + (rect.x - rect.width / 2) * sx, y + (rect.y - rect.height / 2) * sy, rect.width * sx, rect.height * sy, 2));
    chapter.spawnPoints.forEach(point => g.fillStyle(UI.rose).fillCircle(x + point.x * sx, y + point.y * sy, 2));
    g.fillStyle(UI.amber).fillTriangle(x + width / 2, y + height / 2 - 5, x + width / 2 - 4, y + height / 2 + 3, x + width / 2 + 4, y + height / 2 + 3);
  }
}
