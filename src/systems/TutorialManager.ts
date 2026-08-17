import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

const REGISTRY_KEY = 'tutorial_done';
const DEPTH = 300;

interface StepDef {
  title: string;
  desc: string;
  keys?: string;
  demoFn?: (scene: Phaser.Scene, cx: number, cy: number) => Phaser.GameObjects.GameObject[];
  trigger: 'click' | 'action';
  actionCheck?: string;
}

function demoMove(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 10);
  objs.push(g);

  const dotX = cx, dotY = cy + 20;
  const dot = scene.add.circle(dotX, dotY, 8, 0x60a5fa, 1).setScrollFactor(0).setDepth(DEPTH + 11);
  objs.push(dot);

  const trail = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 9);
  objs.push(trail);

  const path = [
    { x: 0, y: -40 }, { x: 40, y: 0 }, { x: 0, y: 40 }, { x: -40, y: 0 },
  ];
  let pathIdx = 0;
  let progress = 0;

  const timer = scene.time.addEvent({
    delay: 16, loop: true,
    callback: () => {
      if (!dot.active) return;
      progress += 0.025;
      if (progress >= 1) { progress = 0; pathIdx = (pathIdx + 1) % path.length; }
      const p = path[pathIdx];
      const np = path[(pathIdx + 1) % path.length];
      dot.x = dotX + Phaser.Math.Linear(p.x, np.x, progress);
      dot.y = dotY + Phaser.Math.Linear(p.y, np.y, progress);

      trail.clear();
      trail.lineStyle(2, 0x60a5fa, 0.3);
      trail.strokeCircle(dotX, dotY, 40);
    },
  });
  objs.push(timer as unknown as Phaser.GameObjects.GameObject);

  const keys = ['W', 'A', 'S', 'D'];
  const kpos = [
    { x: cx, y: cy - 40 }, { x: cx - 30, y: cy - 10 },
    { x: cx, y: cy - 10 }, { x: cx + 30, y: cy - 10 },
  ];
  for (let i = 0; i < 4; i++) {
    const kb = scene.add.rectangle(kpos[i].x, kpos[i].y, 24, 24, 0x1e293b, 0.9)
      .setStrokeStyle(1, 0x60a5fa, 0.6).setScrollFactor(0).setDepth(DEPTH + 11);
    objs.push(kb);
    const kt = scene.add.text(kpos[i].x, kpos[i].y, keys[i], {
      fontFamily: 'monospace', fontSize: '12px', color: '#93c5fd',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 12);
    objs.push(kt);
  }

  return objs;
}

function demoShoot(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const heroX = cx - 50, heroY = cy + 20;

  const hero = scene.add.circle(heroX, heroY, 8, 0x60a5fa, 0.8).setScrollFactor(0).setDepth(DEPTH + 11);
  objs.push(hero);

  const crosshair = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 11);
  let chX = cx + 50, chY = cy + 20;
  const updateCH = () => {
    crosshair.clear();
    crosshair.lineStyle(1.5, 0xef4444, 0.8);
    crosshair.strokeCircle(chX, chY, 8);
    crosshair.lineBetween(chX - 12, chY, chX - 5, chY);
    crosshair.lineBetween(chX + 5, chY, chX + 12, chY);
    crosshair.lineBetween(chX, chY - 12, chX, chY - 5);
    crosshair.lineBetween(chX, chY + 5, chX, chY + 12);
  };
  updateCH();
  objs.push(crosshair);

  let bulletActive = false;
  let bx = heroX, by = heroY;
  const bulletGfx = scene.add.circle(bx, by, 3, 0xfbbf24, 0).setScrollFactor(0).setDepth(DEPTH + 11);
  objs.push(bulletGfx);

  const timer = scene.time.addEvent({
    delay: 16, loop: true,
    callback: () => {
      if (!hero.active) return;
      const t = scene.time.now * 0.001;
      chX = cx + 50 + Math.sin(t * 2) * 20;
      chY = cy + 20 + Math.cos(t * 1.5) * 15;
      updateCH();

      if (!bulletActive && Math.sin(t * 3) > 0.9) {
        bulletActive = true;
        bx = heroX; by = heroY;
        bulletGfx.setAlpha(1);
      }
      if (bulletActive) {
        const a = Math.atan2(chY - heroY, chX - heroX);
        bx += Math.cos(a) * 4;
        by += Math.sin(a) * 4;
        bulletGfx.setPosition(bx, by);
        if (Phaser.Math.Distance.Between(bx, by, chX, chY) < 15) {
          bulletActive = false;
          bulletGfx.setAlpha(0);
          bx = heroX; by = heroY;
        }
      }
    },
  });
  objs.push(timer as unknown as Phaser.GameObjects.GameObject);

  const mouseIcon = scene.add.text(cx + 60, cy - 15, '🖱', {
    fontSize: '20px',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 12);
  objs.push(mouseIcon);
  scene.tweens.add({
    targets: mouseIcon, alpha: { from: 1, to: 0.4 },
    duration: 600, yoyo: true, repeat: -1,
  });

  return objs;
}

function demoDash(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const startX = cx - 40, endX = cx + 40, y = cy + 20;

  const hero = scene.add.circle(startX, y, 8, 0x60a5fa, 0.8).setScrollFactor(0).setDepth(DEPTH + 11);
  objs.push(hero);

  for (let i = 0; i < 3; i++) {
    const ghost = scene.add.circle(startX, y, 8, 0x60a5fa, 0).setScrollFactor(0).setDepth(DEPTH + 10);
    objs.push(ghost);
  }

  const timer = scene.time.addEvent({
    delay: 16, loop: true,
    callback: () => {
      if (!hero.active) return;
      const cycle = (scene.time.now % 2000) / 2000;
      if (cycle < 0.3) {
        hero.x = startX;
        hero.setAlpha(0.8);
      } else if (cycle < 0.5) {
        const p = (cycle - 0.3) / 0.2;
        hero.x = Phaser.Math.Linear(startX, endX, p);
        hero.setAlpha(0.4);
      } else if (cycle < 0.7) {
        hero.x = endX;
        hero.setAlpha(0.8);
      } else {
        hero.x = endX;
        hero.setAlpha(0.8);
      }
    },
  });
  objs.push(timer as unknown as Phaser.GameObjects.GameObject);

  const arrow = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 10);
  arrow.lineStyle(2, 0x22c55e, 0.5);
  arrow.lineBetween(startX, y + 20, endX, y + 20);
  arrow.lineBetween(endX - 8, y + 14, endX, y + 20);
  arrow.lineBetween(endX - 8, y + 26, endX, y + 20);
  objs.push(arrow);

  return objs;
}

function demoSkill(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];

  const hero = scene.add.circle(cx, cy + 20, 8, 0x60a5fa, 0.8).setScrollFactor(0).setDepth(DEPTH + 11);
  objs.push(hero);

  const ring = scene.add.circle(cx, cy + 20, 10, 0xfbbf24, 0)
    .setStrokeStyle(2, 0xfbbf24, 0).setScrollFactor(0).setDepth(DEPTH + 10);
  objs.push(ring);

  const timer = scene.time.addEvent({
    delay: 16, loop: true,
    callback: () => {
      if (!hero.active) return;
      const cycle = (scene.time.now % 2500) / 2500;
      if (cycle < 0.6) {
        const p = cycle / 0.6;
        ring.setStrokeStyle(2, 0xfbbf24, p * 0.5);
        ring.setRadius(10 + p * 5);
      } else if (cycle < 0.7) {
        const p = (cycle - 0.6) / 0.1;
        ring.setStrokeStyle(3, 0xfbbf24, 0.8);
        ring.setRadius(15 + p * 50);
        ring.setFillStyle(0xfbbf24, (1 - p) * 0.3);
      } else {
        ring.setStrokeStyle(2, 0xfbbf24, 0);
        ring.setFillStyle(0xfbbf24, 0);
        ring.setRadius(10);
      }
    },
  });
  objs.push(timer as unknown as Phaser.GameObjects.GameObject);

  const chargeBg = scene.add.rectangle(cx - 30, cy + 55, 60, 8, 0x1e293b, 0.8)
    .setOrigin(0, 0.5).setStrokeStyle(1, 0x374151).setScrollFactor(0).setDepth(DEPTH + 11);
  objs.push(chargeBg);

  const chargeFill = scene.add.rectangle(cx - 30, cy + 55, 0, 6, 0xfbbf24, 0.9)
    .setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH + 12);
  objs.push(chargeFill);

  scene.tweens.add({
    targets: chargeFill, width: 58, duration: 1500, yoyo: true, repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return objs;
}

const STEPS: StepDef[] = [
  {
    title: '移动',
    desc: '使用 WASD 键控制角色移动\n在战场上灵活走位躲避敌人',
    keys: 'W A S D',
    demoFn: demoMove,
    trigger: 'click',
  },
  {
    title: '射击',
    desc: '鼠标瞄准敌人方向\n按住左键持续射击',
    keys: '鼠标左键',
    demoFn: demoShoot,
    trigger: 'click',
  },
  {
    title: '闪避',
    desc: '按 Shift 或鼠标右键快速位移\n闪避期间无敌，可穿越子弹',
    keys: 'Shift / 右键',
    demoFn: demoDash,
    trigger: 'click',
  },
  {
    title: '技能',
    desc: '击杀敌人积累能量\n能量满时按 Space 释放强力技能\n按 Q 切换已解锁的技能',
    keys: 'Space / Q',
    demoFn: demoSkill,
    trigger: 'click',
  },
  {
    title: '升级',
    desc: '每波结束后可选择一项强化\n包括攻击、防御、移动和技能升级\n合理选择升级路线是生存的关键',
    trigger: 'click',
  },
];

export class TutorialManager {
  private scene: Phaser.Scene;
  private step = 0;
  private active = false;
  private completed = false;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private demoObjects: Phaser.GameObjects.GameObject[] = [];
  private gamePausedByTutorial = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (scene.registry.get(REGISTRY_KEY)) {
      this.completed = true;
    }
  }

  get isActive(): boolean { return this.active; }
  get isDone(): boolean { return this.completed; }

  start(): void {
    if (this.completed) return;
    this.step = 0;

    this.scene.time.delayedCall(600, () => {
      if (this.completed) return;
      this.active = true;
      this.pauseAndShowStep(0);
    });
  }

  onMove(): void { /* not used in pause-based tutorial */ }
  onShoot(): void { /* not used */ }
  onDash(): void { /* not used */ }
  onChargeReady(): void { /* not used */ }
  onSkillUse(): void { /* not used */ }

  private pauseAndShowStep(idx: number): void {
    this.step = idx;
    const def = STEPS[idx];
    if (!def) { this.complete(); return; }

    this.pauseGame();
    this.clearUI();
    this.buildStepUI(def, idx);
  }

  private pauseGame(): void {
    this.gamePausedByTutorial = true;
    try { this.scene.physics.pause(); } catch { /* noop */ }
  }

  private resumeGame(): void {
    this.gamePausedByTutorial = false;
    try { this.scene.physics.resume(); } catch { /* noop */ }
    try {
      this.scene.physics.world.timeScale = 1;
    } catch { /* noop */ }
  }

  private buildStepUI(def: StepDef, idx: number): void {
    const w = GAME_WIDTH, h = GAME_HEIGHT;

    // Full-screen dim overlay
    const overlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.uiObjects.push(overlay);

    // Main card
    const cardW = 380, cardH = 320;
    const cardX = w / 2, cardY = h / 2 - 10;

    const cardBg = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 1);
    cardBg.fillStyle(0x0f172a, 0.95);
    cardBg.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);
    cardBg.lineStyle(1.5, 0x1e3a5f, 0.8);
    cardBg.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);
    this.uiObjects.push(cardBg);

    // Step indicator
    const stepStr = `${idx + 1} / ${STEPS.length}`;
    const stepLabel = this.scene.add.text(cardX, cardY - cardH / 2 + 22, stepStr, {
      fontFamily: 'monospace', fontSize: '12px', color: '#64748b',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.uiObjects.push(stepLabel);

    // Dots
    const dotY = cardY - cardH / 2 + 22;
    const dotStartX = cardX - (STEPS.length - 1) * 10 / 2;
    for (let i = 0; i < STEPS.length; i++) {
      const dx = dotStartX + i * 10 + 60;
      const dot = this.scene.add.circle(dx, dotY, 3,
        i < idx ? 0x22c55e : i === idx ? 0x60a5fa : 0x374151, 1,
      ).setScrollFactor(0).setDepth(DEPTH + 2);
      this.uiObjects.push(dot);
    }

    // Title
    const title = this.scene.add.text(cardX, cardY - cardH / 2 + 55, def.title, {
      fontFamily: 'monospace', fontSize: '24px', color: '#e2e8f0', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.uiObjects.push(title);

    // Key badges
    if (def.keys) {
      const keyBadge = this.scene.add.text(cardX, cardY - cardH / 2 + 80, def.keys, {
        fontFamily: 'monospace', fontSize: '13px', color: '#93c5fd',
        backgroundColor: '#1e293b', padding: { x: 8, y: 3 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
      this.uiObjects.push(keyBadge);
    }

    // Demo area
    const demoY = cardY - 10;
    if (def.demoFn) {
      const demoObjs = def.demoFn(this.scene, cardX, demoY);
      this.demoObjects.push(...demoObjs);
    }

    // Description
    const descY = def.demoFn ? cardY + 70 : cardY + 10;
    const desc = this.scene.add.text(cardX, descY, def.desc, {
      fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.uiObjects.push(desc);

    // Continue button
    const btnY = cardY + cardH / 2 - 30;
    const isLast = idx === STEPS.length - 1;
    const btnLabel = isLast ? '开始战斗！' : '下一步 →';
    const btnColor = isLast ? 0x22c55e : 0x3b82f6;

    const btnBg = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 2);
    const btnW = 140, btnH = 34;
    btnBg.fillStyle(btnColor, 0.15);
    btnBg.fillRoundedRect(cardX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    btnBg.lineStyle(1, btnColor, 0.6);
    btnBg.strokeRoundedRect(cardX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    this.uiObjects.push(btnBg);

    const btnText = this.scene.add.text(cardX, btnY, btnLabel, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
    this.uiObjects.push(btnText);

    const btnHit = this.scene.add.rectangle(cardX, btnY, btnW, btnH, 0x000000, 0)
      .setScrollFactor(0).setDepth(DEPTH + 4).setInteractive({ useHandCursor: true });
    this.uiObjects.push(btnHit);

    btnHit.on('pointerover', () => {
      btnBg.clear();
      btnBg.fillStyle(btnColor, 0.3);
      btnBg.fillRoundedRect(cardX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
      btnBg.lineStyle(1.5, btnColor, 0.9);
      btnBg.strokeRoundedRect(cardX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    });
    btnHit.on('pointerout', () => {
      btnBg.clear();
      btnBg.fillStyle(btnColor, 0.15);
      btnBg.fillRoundedRect(cardX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
      btnBg.lineStyle(1, btnColor, 0.6);
      btnBg.strokeRoundedRect(cardX - btnW / 2, btnY - btnH / 2, btnW, btnH, 6);
    });

    btnHit.on('pointerdown', () => {
      this.clearUI();
      if (isLast) {
        this.complete();
      } else {
        this.pauseAndShowStep(idx + 1);
      }
    });

    // Skip button
    if (!isLast) {
      const skipText = this.scene.add.text(cardX + cardW / 2 - 15, cardY - cardH / 2 + 15, '跳过', {
        fontFamily: 'monospace', fontSize: '11px', color: '#64748b',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(DEPTH + 3).setInteractive({ useHandCursor: true });
      this.uiObjects.push(skipText);
      skipText.on('pointerover', () => skipText.setColor('#94a3b8'));
      skipText.on('pointerout', () => skipText.setColor('#64748b'));
      skipText.on('pointerdown', () => {
        this.clearUI();
        this.complete();
      });
    }

    // Entrance animation
    const allUI = [...this.uiObjects, ...this.demoObjects];
    for (const obj of allUI) {
      const go = obj as unknown as { alpha?: number; setAlpha?: (v: number) => void };
      if (typeof go.setAlpha === 'function' && typeof go.alpha === 'number') {
        const origAlpha = go.alpha;
        go.setAlpha(0);
        this.scene.tweens.add({ targets: obj, alpha: origAlpha, duration: 250, ease: 'Quad.easeOut' });
      }
    }
  }

  private clearUI(): void {
    for (const obj of this.demoObjects) {
      if (obj instanceof Phaser.Time.TimerEvent) {
        obj.remove(false);
      } else if ('destroy' in obj && typeof (obj as Phaser.GameObjects.GameObject).destroy === 'function') {
        (obj as Phaser.GameObjects.GameObject).destroy();
      }
    }
    this.demoObjects = [];

    for (const obj of this.uiObjects) {
      if ('destroy' in obj && typeof (obj as Phaser.GameObjects.GameObject).destroy === 'function') {
        (obj as Phaser.GameObjects.GameObject).destroy();
      }
    }
    this.uiObjects = [];
  }

  private complete(): void {
    this.clearUI();
    this.completed = true;
    this.active = false;
    this.resumeGame();

    this.scene.registry.set(REGISTRY_KEY, true);
  }

  destroy(): void {
    this.clearUI();
    if (this.gamePausedByTutorial) {
      this.resumeGame();
    }
    this.active = false;
  }
}
