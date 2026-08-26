import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { SoundManager } from '../systems/SoundManager';
import {
  MetaProgressionManager, WORKSHOP_MAX_RANK, WORKSHOP_MODULES,
  WorkshopModuleId, workshopUpgradeCost,
} from '../systems/MetaProgressionManager';

export class WorkshopScene extends Phaser.Scene {
  constructor() { super('WorkshopScene'); }

  create() {
    const snd = SoundManager.get();
    const state = MetaProgressionManager.getState();
    const level = MetaProgressionManager.getWorkshopLevel(state);
    const bonuses = MetaProgressionManager.getBonuses(state);
    this.cameras.main.setBackgroundColor(0x080c14);

    const glow = this.add.graphics();
    for (let r = 330; r > 0; r -= 35) {
      glow.fillStyle(0x172554, 0.018);
      glow.fillCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, r);
    }

    this.add.text(GAME_WIDTH / 2, 72, '军 团 工 坊', {
      fontSize: '36px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 116, '把每次突围的数据与残骸，转化为下一局的微弱优势', {
      fontSize: '14px', fontFamily: 'monospace', color: '#64748b',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 165, `◆ 影核 ${state.shadowCores}    ·    工坊等级 ${level}/15`, {
      fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
    }).setOrigin(0.5);

    const cardY = 365;
    WORKSHOP_MODULES.forEach((module, index) => {
      const x = 205 + index * 307;
      const rank = state.modules[module.id];
      const cost = workshopUpgradeCost(rank);
      const canBuy = rank < WORKSHOP_MAX_RANK && state.shadowCores >= cost;

      const card = this.add.graphics();
      const draw = (hover: boolean) => {
        card.clear();
        card.fillStyle(hover && canBuy ? 0x172033 : 0x0f172a, 0.98);
        card.fillRoundedRect(x - 128, cardY - 150, 256, 300, 12);
        card.lineStyle(hover && canBuy ? 2 : 1, module.color, hover && canBuy ? 0.9 : 0.45);
        card.strokeRoundedRect(x - 128, cardY - 150, 256, 300, 12);
      };
      draw(false);

      this.add.circle(x, cardY - 98, 25, module.color, 0.16)
        .setStrokeStyle(2, module.color, 0.8);
      this.add.text(x, cardY - 98, `${index + 1}`, {
        fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold',
        color: `#${module.color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);
      this.add.text(x, cardY - 48, module.name, {
        fontSize: '21px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
      }).setOrigin(0.5);
      this.add.text(x, cardY - 12, module.desc, {
        fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
      }).setOrigin(0.5);
      this.add.text(x, cardY + 20, module.perRank, {
        fontSize: '13px', fontFamily: 'monospace', color: `#${module.color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);

      const pips = this.add.graphics();
      for (let i = 0; i < WORKSHOP_MAX_RANK; i++) {
        pips.fillStyle(i < rank ? module.color : 0x1e293b, i < rank ? 1 : 0.8);
        pips.fillRoundedRect(x - 56 + i * 25, cardY + 54, 18, 8, 3);
      }

      const label = rank >= WORKSHOP_MAX_RANK ? '已满级' : `升级  ◆${cost}`;
      const buttonColor = rank >= WORKSHOP_MAX_RANK ? 0x111827 : canBuy ? 0x1d4ed8 : 0x172033;
      const btn = this.add.rectangle(x, cardY + 105, 150, 40, buttonColor)
        .setStrokeStyle(1, canBuy ? 0x60a5fa : 0x334155, 0.65);
      const btnText = this.add.text(x, cardY + 105, label, {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold',
        color: canBuy ? '#ffffff' : '#64748b',
      }).setOrigin(0.5);

      if (rank < WORKSHOP_MAX_RANK) {
        btn.setInteractive({ useHandCursor: canBuy });
        btn.on('pointerover', () => { draw(true); if (canBuy) btnText.setColor('#fbbf24'); });
        btn.on('pointerout', () => { draw(false); btnText.setColor(canBuy ? '#ffffff' : '#64748b'); });
        btn.on('pointerdown', () => this.buyModule(module.id, snd));
      }
    });

    const bestTime = state.bestVictorySec === null
      ? '--:--'
      : `${Math.floor(state.bestVictorySec / 60)}:${String(state.bestVictorySec % 60).padStart(2, '0')}`;
    this.add.text(GAME_WIDTH / 2, 555,
      `突围 ${state.totalRuns} 次  ·  胜利 ${state.wins} 次  ·  协议通关 ${state.clearedBuilds.length}/3  ·  最快 ${bestTime}`,
      { fontSize: '14px', fontFamily: 'monospace', color: '#94a3b8' },
    ).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 590,
      `当前增幅：伤害 +${Math.round((bonuses.damageMult - 1) * 100)}%  ·  生命 +${bonuses.maxHpBonus}  ·  初始能量 +${bonuses.startCharge}`,
      { fontSize: '14px', fontFamily: 'monospace', color: '#fbbf24' },
    ).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 625, '增幅刻意封顶；真正决定胜负的仍是局内构筑与操作', {
      fontSize: '12px', fontFamily: 'monospace', color: '#475569',
    }).setOrigin(0.5);

    const back = this.add.rectangle(GAME_WIDTH / 2, 690, 200, 46, 0x111827)
      .setStrokeStyle(1, 0x334155, 0.7).setInteractive({ useHandCursor: true });
    const backText = this.add.text(GAME_WIDTH / 2, 690, '返回菜单  [ESC]', {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold', color: '#cbd5e1',
    }).setOrigin(0.5);
    back.on('pointerover', () => backText.setColor('#fbbf24'));
    back.on('pointerout', () => backText.setColor('#cbd5e1'));
    back.on('pointerdown', () => { snd.buttonClick(); this.scene.start('MenuScene'); });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('MenuScene'));
  }

  private buyModule(id: WorkshopModuleId, snd: SoundManager): void {
    if (!MetaProgressionManager.purchase(id)) {
      snd.buttonHover();
      return;
    }
    snd.upgrade();
    this.cameras.main.flash(100, 80, 120, 255, true);
    this.scene.restart();
  }
}
