import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';

const STORAGE_KEY = 'shadowlegion_tutorial_v4';
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

    const overlay = this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x514b3d, 0.55)
      .setScrollFactor(0).setDepth(DEPTH);
    this.objects.push(overlay);

    const panel = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
    panel.fillStyle(0xfff8e8, 0.99);
    panel.fillRoundedRect(cx - 330, cy - 205, 660, 410, 14);
    panel.lineStyle(2, 0xa5b594, 0.9);
    panel.strokeRoundedRect(cx - 330, cy - 205, 660, 410, 14);
    this.objects.push(panel);

    this.objects.push(this.scene.add.text(cx, cy - 165, '第一段同行，从这里开始', {
      fontSize: '28px', fontFamily: 'sans-serif', fontStyle: 'bold', color: '#3e5947',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2));

    this.objects.push(this.scene.add.text(cx, cy - 125, '五章五十段小旅途。你去截击，让影伴照看另一条路。', {
      fontSize: '14px', fontFamily: 'sans-serif', color: '#866444',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2));

    const cards = [
      { x: cx - 205, key: 'WASD', title: '轻快出发', desc: '绕过树荫掩体\n提前截住来客', color: 0x527d65 },
      { x: cx, key: '鼠标左键', title: '瞄准与射击', desc: '先照看蘑菇投手\n茶师和彩屑南瓜', color: 0xa97443 },
      { x: cx + 205, key: 'SHIFT / 右键', title: '闪避与回营', desc: '短暂无敌\n离开填色预警区', color: 0x857393 },
    ];

    for (const card of cards) {
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 2);
      g.fillStyle(0xefeeda, 0.95);
      g.fillRoundedRect(card.x - 88, cy - 85, 176, 150, 9);
      g.lineStyle(1, card.color, 0.55);
      g.strokeRoundedRect(card.x - 88, cy - 85, 176, 150, 9);
      this.objects.push(g);

      this.objects.push(this.scene.add.text(card.x, cy - 57, card.key, {
        fontSize: '14px', fontFamily: 'sans-serif', fontStyle: 'bold', color: '#3e5947',
        backgroundColor: '#fffaf0', padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
      this.objects.push(this.scene.add.text(card.x, cy - 12, card.title, {
        fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold',
        color: `#${card.color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
      this.objects.push(this.scene.add.text(card.x, cy + 28, card.desc, {
        fontSize: '13px', fontFamily: 'sans-serif', color: '#666956', align: 'center', lineSpacing: 5,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
    }

    this.objects.push(this.scene.add.text(cx, cy + 87, 'SPACE 拿手技能 · Q 切换技能 · 每波选一张成长卡 · ESC 暂停', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#62674f',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));
    this.objects.push(this.scene.add.text(cx, cy + 110, 'E 安排影伴同行 / 守营 · 你与营地的生命都不能归零', {
      fontSize: '13px', fontFamily: 'sans-serif', fontStyle: 'bold', color: '#8c603e',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3));

    const btn = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 3);
    btn.fillStyle(0x5c8267);
    btn.fillRoundedRect(cx - 105, cy + 132, 210, 50, 8);
    btn.lineStyle(1, 0x40644e, 0.8);
    btn.strokeRoundedRect(cx - 105, cy + 132, 210, 50, 8);
    this.objects.push(btn);
    this.objects.push(this.scene.add.text(cx, cy + 157, '一起出发  [ENTER]', {
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
