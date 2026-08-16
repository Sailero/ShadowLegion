import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/gameConfig';

const STORAGE_KEY = 'shadowlegion_tutorial_done';
const DEPTH = 210;
const BANNER_W = 480;
const BANNER_H = 72;
const BANNER_Y = GAME_HEIGHT - 48;

interface StepDef {
  prompt: string;
  sub: string;
  autoMs?: number;
}

const STEPS: StepDef[] = [
  { prompt: 'WASD 移动', sub: '按下 W / A / S / D 开始移动' },
  { prompt: '鼠标瞄准 · 左键射击', sub: '瞄准敌人并点击左键开火' },
  { prompt: 'Shift 或 右键 闪避', sub: '快速位移躲避伤害' },
  { prompt: '击杀敌人充能技能', sub: '击败敌人可积累技能能量', autoMs: 3000 },
  { prompt: 'Space 释放技能', sub: '能量满时按 Space 释放' },
];

export class TutorialManager {
  private scene: Phaser.Scene;
  private step = 0;
  private active = false;
  private overlay: Phaser.GameObjects.Graphics | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private subText: Phaser.GameObjects.Text | null = null;
  private completed = false;
  private chargeReadyPending = false;
  private autoTimer: Phaser.Time.TimerEvent | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
      this.completed = true;
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  get isDone(): boolean {
    if (this.completed) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
      return true;
    }
    return false;
  }

  start(): void {
    if (this.isDone) return;

    this.active = true;
    this.step = 0;
    this.createUI();
    this.showStep(0, false);
  }

  onMove(): void {
    if (!this.active || this.step !== 0) return;
    this.advanceTo(1);
  }

  onShoot(): void {
    if (!this.active || this.step !== 1) return;
    this.advanceTo(2);
  }

  onDash(): void {
    if (!this.active || this.step !== 2) return;
    this.advanceTo(3);
  }

  onChargeReady(): void {
    if (!this.active || this.step < 3) return;
    if (this.step === 3) {
      this.chargeReadyPending = true;
      return;
    }
    if (this.step === 4) return;
    this.advanceTo(4);
  }

  onSkillUse(): void {
    if (!this.active || this.step !== 4) return;
    this.complete();
  }

  private createUI(): void {
    const cx = GAME_WIDTH / 2;
    const bannerX = cx - BANNER_W / 2;
    const bannerTop = BANNER_Y - BANNER_H / 2;

    this.overlay = this.scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(DEPTH);

    this.overlay.fillStyle(COLORS.overlay, 0.72);
    this.overlay.fillRoundedRect(bannerX, bannerTop, BANNER_W, BANNER_H, 8);
    this.overlay.lineStyle(1, 0x1e3a5f, 0.6);
    this.overlay.strokeRoundedRect(bannerX, bannerTop, BANNER_W, BANNER_H, 8);

    this.promptText = this.scene.add.text(cx, BANNER_Y - 8, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 1).setAlpha(0);

    this.subText = this.scene.add.text(cx, BANNER_Y + 14, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: COLORS.uiDim,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 1).setAlpha(0);
  }

  private showStep(index: number, animate: boolean): void {
    const def = STEPS[index];
    if (!def || !this.promptText || !this.subText) return;

    this.clearAutoTimer();
    this.stopPulse();

    const applyContent = (): void => {
      this.promptText!.setText(def.prompt);
      this.subText!.setText(def.sub);
      this.startPulse();

      if (def.autoMs !== undefined) {
        this.autoTimer = this.scene.time.delayedCall(def.autoMs, () => {
          this.autoTimer = null;
          if (this.step !== index) return;
          this.onAutoStepComplete(index);
        });
      }
    };

    if (!animate) {
      this.promptText.setAlpha(1);
      this.subText.setAlpha(1);
      applyContent();
      return;
    }

    this.scene.tweens.add({
      targets: [this.promptText, this.subText],
      alpha: 0,
      duration: 200,
      onComplete: () => {
        applyContent();
        this.scene.tweens.add({
          targets: [this.promptText, this.subText],
          alpha: 1,
          duration: 300,
        });
      },
    });
  }

  private onAutoStepComplete(index: number): void {
    if (index === 3) {
      this.fadeOutPrompt(() => {
        this.step = 4;
        if (this.chargeReadyPending) {
          this.chargeReadyPending = false;
          this.showStep(4, true);
        }
      });
    }
  }

  private fadeOutPrompt(onDone: () => void): void {
    if (!this.promptText || !this.subText) {
      onDone();
      return;
    }
    this.stopPulse();
    this.scene.tweens.add({
      targets: [this.promptText, this.subText],
      alpha: 0,
      duration: 250,
      onComplete: onDone,
    });
  }

  private advanceTo(nextStep: number): void {
    this.step = nextStep;
    this.showStep(nextStep, true);
  }

  private startPulse(): void {
    if (!this.promptText) return;
    this.stopPulse();
    this.pulseTween = this.scene.tweens.add({
      targets: this.promptText,
      alpha: { from: 1, to: 0.65 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopPulse(): void {
    if (this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
    }
    if (this.promptText) {
      this.promptText.setAlpha(1);
    }
  }

  private clearAutoTimer(): void {
    if (this.autoTimer) {
      this.autoTimer.remove(false);
      this.autoTimer = null;
    }
  }

  private complete(): void {
    this.completed = true;
    this.active = false;
    this.clearAutoTimer();
    this.stopPulse();

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, '1');
    }

    if (this.promptText && this.subText) {
      this.promptText.setText('教学完成!');
      this.subText.setText('');
      this.scene.tweens.add({
        targets: [this.promptText, this.subText],
        alpha: 1,
        duration: 200,
      });

      this.scene.time.delayedCall(1800, () => {
        this.scene.tweens.add({
          targets: [this.promptText, this.subText, this.overlay],
          alpha: 0,
          duration: 400,
          onComplete: () => this.destroy(),
        });
      });
    } else {
      this.destroy();
    }
  }

  destroy(): void {
    this.clearAutoTimer();
    this.stopPulse();
    this.overlay?.destroy();
    this.promptText?.destroy();
    this.subText?.destroy();
    this.overlay = null;
    this.promptText = null;
    this.subText = null;
    this.active = false;
  }
}
