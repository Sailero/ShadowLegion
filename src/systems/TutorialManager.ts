import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

const STORAGE_KEY = 'shadowlegion_tutorial_v2';
const DEPTH = 300;

/** A single-screen onboarding card. Combat teaches the details contextually. */
export class TutorialManager {
  private scene: Phaser.Scene;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private enterHandler?: () => void;
  isActive = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  start(): void {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'done') return;
    } catch { /* storage may be disabled */ }

    this.isActive = true;
    this.scene.physics.pause();
    this.buildUI();
  }

  onMove(): void { /* onboarding is intentionally non-blocking */ }
  onShoot(): void { /* onboarding is intentionally non-blocking */ }
  onDash(): void { /* onboarding is intentionally non-blocking */ }
  onChargeReady(): void { /* onboarding is intentionally non-blocking */ }
  onSkillUse(): void { /* onboarding is intentionally non-blocking */ }

  destroy(): void {
    this.clearUI();
    this.isActive = false;
  }

  private buildUI(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x02050a, 0.82)
      .setScrollFactor(0).setDepth(DEPTH);
    this.objects.push(overlay);

    const panel = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
    panel.fillStyle(0x0f172a, 0.98);
    panel.fillRoundedRect(cx - 330, cy - 205, 660, 410, 14);
    panel.lineStyle(2, 0x3b82f6, 0.65);
    panel.strokeRoundedRect(cx - 330, cy - 205, 660, 410, 14);
    this.objects.push(panel);

    this.objects.push(this.scene.add.text(cx, cy - 165, '突围简报', {
      fontSize: '30px', fontFamily: 'monospace', fontStyle: 'bold', color: '#e2e8f0',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2));

    this.objects.push(this.scene.add.text(cx, cy - 125, '守住防线核心，击破每章 5 波进攻', {
      fontSize: '15px', fontFamily: 'monospace', color: '#fbbf24',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2));

    const cards = [
      { x: cx - 205, key: 'WASD', title: '机动防守', desc: '依托掩体\n拦截进攻路线', color: 0x60a5fa },
      { x: cx, key: '鼠标左键', title: '瞄准射击', desc: '优先击破\n远程、治疗与爆破', color: 0xfbbf24 },
      { x: cx + 205, key: 'SHIFT / 右键', title: '闪避', desc: '短暂无敌\n穿过 Boss 预警区', color: 0x818cf8 },
    ];

    for (const card of cards) {
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 2);
      g.fillStyle(0x111c2e, 0.95);
      g.fillRoundedRect(card.x - 88, cy - 85, 176, 150, 9);
      g.lineStyle(1, card.color, 0.55);
      g.strokeRoundedRect(card.x - 88, cy - 85, 176, 150, 9);
      this.objects.push(g);

      this.objects.push(this.scene.add.text(card.x, cy - 57, card.key, {
        fontSize: '14px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
        backgroundColor: '#1e293b', padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
      this.objects.push(this.scene.add.text(card.x, cy - 12, card.title, {
        fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold',
        color: `#${card.color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
      this.objects.push(this.scene.add.text(card.x, cy + 28, card.desc, {
        fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8', align: 'center', lineSpacing: 5,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
    }

    this.objects.push(this.scene.add.text(cx, cy + 93, '击杀充能，SPACE 释放兵种技能  ·  每波结束三选一改装  ·  ESC 暂停', {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));

    const btn = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 3);
    btn.fillStyle(0x1d4ed8);
    btn.fillRoundedRect(cx - 105, cy + 132, 210, 50, 8);
    btn.lineStyle(1, 0x60a5fa, 0.8);
    btn.strokeRoundedRect(cx - 105, cy + 132, 210, 50, 8);
    this.objects.push(btn);
    this.objects.push(this.scene.add.text(cx, cy + 157, '开始突围  [ENTER]', {
      fontSize: '16px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 4));

    const hit = this.scene.add.rectangle(cx, cy + 157, 210, 50, 0xffffff, 0)
      .setScrollFactor(0).setDepth(DEPTH + 5).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.complete());
    this.objects.push(hit);

    this.enterHandler = () => this.complete();
    this.scene.input.keyboard?.once('keydown-ENTER', this.enterHandler);
  }

  private complete(): void {
    if (!this.isActive) return;
    try { localStorage.setItem(STORAGE_KEY, 'done'); } catch { /* noop */ }
    this.clearUI();
    this.isActive = false;
    this.scene.physics.resume();
  }

  private clearUI(): void {
    if (this.enterHandler) {
      this.scene.input.keyboard?.off('keydown-ENTER', this.enterHandler);
      this.enterHandler = undefined;
    }
    this.objects.forEach(object => {
      try { object.destroy(); } catch { /* already gone */ }
    });
    this.objects = [];
  }
}
