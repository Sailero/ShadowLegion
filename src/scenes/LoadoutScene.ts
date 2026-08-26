import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { CHAPTERS } from '../data/chapters';
import { getOperative, OPERATIVES, OperativeId } from '../data/operatives';
import { getSkill } from '../data/skills';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { SoundManager } from '../systems/SoundManager';

export class LoadoutScene extends Phaser.Scene {
  private endless = false;
  private selectedOperative: OperativeId = 'ranger';
  private selectedChapter = 1;

  constructor() { super('LoadoutScene'); }

  init(data: { endless?: boolean; operativeId?: OperativeId; chapter?: number }) {
    this.endless = Boolean(data.endless);
    this.selectedOperative = data.operativeId ?? 'ranger';
    this.selectedChapter = data.chapter ?? 1;
  }

  create() {
    const state = MetaProgressionManager.getState();
    const snd = SoundManager.get();
    if (!state.unlockedOperatives.includes(this.selectedOperative)) this.selectedOperative = 'ranger';
    this.selectedChapter = Phaser.Math.Clamp(this.selectedChapter, 1, state.highestChapterUnlocked);
    this.cameras.main.setBackgroundColor(0x080c14);

    const bg = this.add.graphics();
    for (let r = 360; r > 0; r -= 32) {
      bg.fillStyle(0x172554, 0.014);
      bg.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, r);
    }

    this.add.text(GAME_WIDTH / 2, 48, this.endless ? '无 尽 编 队' : '行 动 编 队', {
      fontSize: '32px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 84, '兵种特性决定开局打法；支援技能会随章节通关进入肉鸽卡池', {
      fontSize: '13px', fontFamily: 'monospace', color: '#64748b',
    }).setOrigin(0.5);

    const cardW = 218, cardH = 238, gap = 18;
    const startX = (GAME_WIDTH - (cardW * 4 + gap * 3)) / 2 + cardW / 2;
    OPERATIVES.forEach((operative, index) => {
      const x = startX + index * (cardW + gap);
      const y = 250;
      const unlocked = state.unlockedOperatives.includes(operative.id);
      const selected = this.selectedOperative === operative.id;
      const panel = this.add.graphics();
      panel.fillStyle(selected ? 0x172033 : 0x0f172a, unlocked ? 0.98 : 0.65);
      panel.fillRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);
      panel.lineStyle(selected ? 2 : 1, unlocked ? operative.color : 0x334155, selected ? 1 : 0.45);
      panel.strokeRoundedRect(x - cardW / 2, y - cardH / 2, cardW, cardH, 10);

      this.add.circle(x, y - 76, 27, operative.color, unlocked ? 0.18 : 0.05)
        .setStrokeStyle(2, unlocked ? operative.color : 0x334155, 0.8);
      this.add.text(x, y - 76, unlocked ? `${index + 1}` : '×', {
        fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold',
        color: unlocked ? `#${operative.color.toString(16).padStart(6, '0')}` : '#475569',
      }).setOrigin(0.5);
      this.add.text(x, y - 32, operative.name, {
        fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: unlocked ? '#e2e8f0' : '#64748b',
      }).setOrigin(0.5);
      this.add.text(x, y - 4, operative.role, {
        fontSize: '12px', fontFamily: 'monospace', color: unlocked ? `#${operative.color.toString(16).padStart(6, '0')}` : '#475569',
      }).setOrigin(0.5);
      this.add.text(x, y + 42, operative.trait, {
        fontSize: '12px', fontFamily: 'monospace', color: unlocked ? '#94a3b8' : '#475569',
        align: 'center', wordWrap: { width: cardW - 28 },
      }).setOrigin(0.5);
      const skill = getSkill(operative.signatureSkill);
      this.add.text(x, y + 88, unlocked ? `专属：${skill?.name ?? operative.signatureSkill}` : `通关第 ${operative.requiredChapter} 章解锁`, {
        fontSize: '11px', fontFamily: 'monospace', color: unlocked ? '#fbbf24' : '#475569',
      }).setOrigin(0.5);

      if (unlocked) {
        this.add.rectangle(x, y, cardW, cardH, 0, 0).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            snd.buttonClick();
            this.scene.restart({ endless: this.endless, operativeId: operative.id, chapter: this.selectedChapter });
          });
      }
    });

    this.add.text(GAME_WIDTH / 2, 410, '选择起始章节', {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#cbd5e1',
    }).setOrigin(0.5);
    CHAPTERS.forEach((chapter, index) => {
      const x = 176 + index * 224;
      const y = 462;
      const unlocked = chapter.id <= state.highestChapterUnlocked;
      const selected = chapter.id === this.selectedChapter;
      const color = unlocked ? chapter.colors.accent : 0x334155;
      const rect = this.add.rectangle(x, y, 196, 64, selected ? 0x172033 : 0x0f172a)
        .setStrokeStyle(selected ? 2 : 1, color, selected ? 0.9 : 0.45);
      this.add.text(x, y - 10, unlocked ? `${chapter.id}. ${chapter.name}` : `${chapter.id}. 未解锁`, {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: unlocked ? '#e2e8f0' : '#475569',
      }).setOrigin(0.5);
      this.add.text(x, y + 13, unlocked ? chapter.specialName : `先通关第 ${chapter.id - 1} 章`, {
        fontSize: '11px', fontFamily: 'monospace', color: unlocked ? `#${color.toString(16).padStart(6, '0')}` : '#334155',
      }).setOrigin(0.5);
      if (unlocked) rect.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        snd.buttonClick();
        this.scene.restart({ endless: this.endless, operativeId: this.selectedOperative, chapter: chapter.id });
      });
    });

    const operative = getOperative(this.selectedOperative);
    const chapter = CHAPTERS[this.selectedChapter - 1];
    this.add.text(GAME_WIDTH / 2, 545, `${operative.name}  ×  ${chapter.name}\n${chapter.specialDesc}`, {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);

    const launch = this.add.rectangle(GAME_WIDTH / 2, 635, 260, 52, 0x1d4ed8)
      .setStrokeStyle(1, operative.color, 0.8).setInteractive({ useHandCursor: true });
    const launchText = this.add.text(GAME_WIDTH / 2, 635, this.endless ? '开始无尽演练' : '开始章节行动', {
      fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);
    launch.on('pointerover', () => launchText.setColor('#fbbf24'));
    launch.on('pointerout', () => launchText.setColor('#ffffff'));
    launch.on('pointerdown', () => {
      snd.buttonClick();
      this.scene.start('ArenaScene', {
        level: this.selectedChapter, operativeId: this.selectedOperative,
        endless: this.endless, freshRun: true,
      });
    });

    this.add.text(GAME_WIDTH / 2, 704, 'ESC 返回菜单', {
      fontSize: '12px', fontFamily: 'monospace', color: '#475569',
    }).setOrigin(0.5);
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('MenuScene'));
  }
}
