import { getBattleTime } from './BattleClock';
import { SettingsManager } from './SettingsManager';
import { getShadowTrial, type ShadowTrialDef } from '../data/modes';
import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, type EnemyType } from '../config/gameConfig';
import type { ChapterDef } from '../data/chapters';
import { pointInRect } from '../data/chapters';
import { Enemy } from '../entities/Enemy';
import type { Hero } from '../entities/Hero';
import type { BulletOpts } from '../entities/Projectile';
import { CatAnimator } from './CatAnimator';
import {
  chooseShadowTarget, deriveShadowTemperament, shadowLineBlocked,
  type ShadowMode, type ShadowPoint, type ShadowTemperament,
} from './ShadowDirector';

export interface ShadowCompanionOptions {
  profile: unknown;
  chapter: ChapterDef;
  core: ShadowPoint;
  onFire: (options: BulletOpts & { source: 'shadow' }) => void;
  spectator?: boolean;
}

/** A visible, non-targetable memory companion with bounded, cover-aware support. */
export class ShadowCompanion {
  readonly temperament: ShadowTemperament;
  private mode: ShadowMode;
  private body: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private lastFire = 0;
  private shots = 0;
  private commandUntil = 0;
  private position: ShadowPoint;
  private portrait?: Phaser.GameObjects.Sprite;
  private animator?: CatAnimator;
  private facingAngle = 0;

  constructor(private scene: Phaser.Scene, private options: ShadowCompanionOptions) {
    this.temperament = deriveShadowTemperament(options.profile);
    this.mode = this.temperament.mode;
    this.position = { x: options.core.x + 82, y: options.core.y + 48 };
    this.body = scene.add.graphics().setDepth(9);
    if (scene.textures.exists('shadow_fox')) {
      this.portrait = scene.add.sprite(this.position.x, this.position.y, 'shadow_fox').setDepth(9).setAlpha(.78);
      this.animator = new CatAnimator(this.portrait, 'echo');
      this.animator.update(0, { speed: 0 });
    }
    this.label = scene.add.text(this.position.x, this.position.y - 30, this.temperament.name, {
      fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#315b51',
      backgroundColor: '#fff7df', padding: { x: 5, y: 3 },
    }).setOrigin(0.5).setDepth(10);
    this.draw(getBattleTime(scene), 0);
  }

  toggleMode(): ShadowMode {
    this.mode = this.mode === 'follow' ? 'guard' : 'follow';
    this.commandUntil = getBattleTime(this.scene) + 700;
    return this.mode;
  }

  getStatus() {
    return {
      name: this.temperament.name, style: this.temperament.style,
      source: this.temperament.source, mode: this.mode,
      label: this.mode === 'guard' ? '照看营地' : '一起出发', shots: this.shots,
    };
  }

  update(time: number, delta: number, hero: Hero, enemies: readonly Enemy[]): void {
    if (!this.body.active || !hero.active) return;
    const before = { ...this.position };
    let anchor: ShadowPoint = { x: hero.x - 56, y: hero.y + 44 };
    if (this.mode === 'guard') {
      let nearest: Enemy | undefined;
      let distance = Infinity;
      for (const enemy of enemies) {
        if (!enemy.active || enemy.getData('shadowRival')) continue;
        const next = Math.hypot(enemy.x - this.options.core.x, enemy.y - this.options.core.y);
        if (next < distance) { nearest = enemy; distance = next; }
      }
      const angle = nearest
        ? Math.atan2(nearest.y - this.options.core.y, nearest.x - this.options.core.x)
        : time * 0.00025;
      anchor = {
        x: this.options.core.x + Math.cos(angle) * this.temperament.orbitRadius,
        y: this.options.core.y + Math.sin(angle) * this.temperament.orbitRadius,
      };
    }
    this.moveToward(this.options.spectator ? { x: this.options.core.x + 65, y: this.options.core.y + 45 } : anchor, time, delta);
    const movedX = this.position.x - before.x, movedY = this.position.y - before.y;
    const speed = delta > 0 ? Math.hypot(movedX, movedY) / delta * 1000 : 0;
    this.animator?.update(delta, { speed, reducedMotion: SettingsManager.get().reducedMotion });
    const target = chooseShadowTarget(this.position, this.options.core, enemies, this.temperament, this.mode, this.options.chapter.obstacles);
    if (target) this.facingAngle = Math.atan2(target.y - this.position.y, target.x - this.position.x);
    else if (Math.abs(movedX) > .01) this.facingAngle = Math.atan2(movedY, movedX);
    const angle = this.facingAngle;
    if (!this.options.spectator && target && time - this.lastFire >= this.temperament.fireIntervalMs) {
      this.lastFire = time;
      this.shots++;
      this.options.onFire({
        x: this.position.x, y: this.position.y, angle, speed: 440,
        damage: this.temperament.damage, owner: 'player', source: 'shadow',
      });
    }
    this.draw(time, angle);
  }

  destroy(): void {
    this.body.destroy();
    this.label.destroy();
    this.portrait?.destroy();
  }

  private moveToward(anchor: ShadowPoint, time: number, delta: number): void {
    const dx = anchor.x - this.position.x;
    const dy = anchor.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) return;
    let terrainScale = 1;
    for (const hazard of this.options.chapter.hazards) {
      if (!pointInRect(this.position.x, this.position.y, hazard)) continue;
      if (this.options.chapter.hazardKind === 'sand') terrainScale = 0.76;
      if (this.options.chapter.hazardKind === 'tide' && Math.floor(time / 5000) % 2 === (hazard.phase || 0)) terrainScale = 0.66;
    }
    const step = Math.min(distance, this.temperament.speed * terrainScale * Math.min(50, Math.max(0, delta)) / 1000);
    const angle = Math.atan2(dy, dx);
    // Evaluate small detours against expanded cover bounds so the companion
    // neither fires nor walks through trees; follow commands let players reroute it.
    const expanded = this.options.chapter.obstacles.map(rect => ({ ...rect, width: rect.width + 24, height: rect.height + 24 }));
    for (const offset of [0, 0.65, -0.65, 1.25, -1.25, 1.7, -1.7]) {
      const candidate = {
        x: Phaser.Math.Clamp(this.position.x + Math.cos(angle + offset) * step, 26, ARENA_WIDTH - 26),
        y: Phaser.Math.Clamp(this.position.y + Math.sin(angle + offset) * step, 26, ARENA_HEIGHT - 26),
      };
      if (!shadowLineBlocked(this.position, candidate, expanded)) { this.position = candidate; break; }
    }
  }

  private draw(time: number, angle: number): void {
    const g = this.body;
    const bob = this.animator || SettingsManager.get().reducedMotion ? 0 : Math.sin(time * 0.005) * 2.5;
    g.clear().setPosition(this.position.x, this.position.y);
    g.fillStyle(0x36584c, 0.14).fillEllipse(0, 14, 33, 11);
    g.lineStyle(2, this.temperament.color, 0.28).strokeCircle(0, bob, 24);
    if (time < this.commandUntil) {
      g.lineStyle(3, 0xe0a562, (this.commandUntil - time) / 700);
      g.strokeCircle(0, bob, 24 + (700 - this.commandUntil + time) * 0.055);
    }
    if (this.portrait) {
      this.portrait.setPosition(this.position.x, this.position.y + bob).setFlipX(Math.cos(angle) < 0);
    } else {
    g.fillStyle(this.temperament.color, 0.95);
    g.fillCircle(-8, -5 + bob, 10).fillCircle(8, -5 + bob, 10).fillCircle(0, 6 + bob, 14);
    g.fillStyle(0xfff5d7, 1).fillCircle(0, 1 + bob, 11);
    g.fillStyle(0x35564a, 1).fillCircle(-4, bob, 1.7).fillCircle(4, bob, 1.7);
    g.lineStyle(1.5, 0x35564a, 1).lineBetween(-2, 5 + bob, 2, 5 + bob);
    g.fillStyle(0xf0af86, 0.8).fillCircle(-7, 4 + bob, 2.5).fillCircle(7, 4 + bob, 2.5);
    g.fillStyle(0xf9dc90, 1).fillCircle(Math.cos(angle) * 19, Math.sin(angle) * 19 + bob, 4);
    }
    this.label.setPosition(this.position.x, this.position.y - 34 + bob);
    this.label.setText(`${this.temperament.name} · ${this.mode === 'guard' ? '守营' : '同行'}`);
  }
}

/** Optional, finite sparring rival derived from the same previous-run profile. */
export class ShadowRival extends Enemy {
  readonly isShadowRival = true;
  private temperament: ShadowTemperament;
  private rivalLabel?: Phaser.GameObjects.Text;
  private telegraph?: Phaser.GameObjects.Graphics;
  private nextVolley = 0;
  private volleyAt = 0;
  private volleyAngle = 0;
  private shotCount = 1;
  private rivalHealth?: Phaser.GameObjects.Graphics;
  private trial?: ShadowTrialDef;
  private catAnimator?: CatAnimator;

  constructor(
    scene: Phaser.Scene, x: number, y: number, profile: unknown, chapterId: number,
    private getHeroPosition: () => ShadowPoint,
    options?: { tier: number; round: number; offsetMs?: number },
  ) {
    const temperament = deriveShadowTemperament(profile);
    const chapter = Math.max(1, Math.min(5, chapterId));
    const cfg: EnemyType = {
      key: 'slime', name: '昨日的自己', color: 0xd59e72, colorDark: 0xa3694b,
      hp: 115 + chapter * 35, speed: temperament.speed * 0.63, damage: 0,
      bodyRadius: 12, xp: 18, score: 100,
    };
    super(scene, x, y, cfg);
    this.temperament = temperament;
    if (options) {
      this.trial = getShadowTrial(options.tier);
      this.hp = Math.round(this.hp * this.trial.healthScale * (1 + (options.round - 1) * .14));
      this.maxHp = this.hp;
      this.spd *= 1 + (options.tier - 1) * .08;
    }
    this.setData('shadowRival', true);
    this.setTexture(scene.textures.exists('shadow_cat_rival') ? 'shadow_cat_rival' : 'hero').setScale(1).setAlpha(0.88);
    this.catAnimator = new CatAnimator(this, 'mirror');
    this.catAnimator.update(0, { speed: 0 });
    (this.body as Phaser.Physics.Arcade.Body).setCircle(12, this.width / 2 - 12, this.height / 2 - 12);
    this.nextVolley = getBattleTime(scene) + 1800 + (options?.offsetMs ?? 0);
    this.shotCount = temperament.style === '火力手' ? 3 : temperament.style === '战术家' ? 2 : 1;
    if (this.trial) this.shotCount = Math.max(this.shotCount, this.trial.volleyCount);
    this.telegraph = scene.add.graphics().setDepth(4);
    this.rivalHealth = scene.add.graphics().setDepth(12);
    this.rivalLabel = scene.add.text(x, y - 40, '切磋 · 昨日的自己', {
      fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#855432',
      backgroundColor: '#fff1d8', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(12);
  }

  override tick(time: number, _delta: number, _targetX: number, _targetY: number): void {
    if (!this.active) return;
    const hero = this.getHeroPosition();
    const angle = Math.atan2(hero.y - this.y, hero.x - this.x);
    const distance = Math.hypot(hero.x - this.x, hero.y - this.y);
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.setFlipX(Math.cos(this.volleyAt ? this.volleyAngle : angle) < 0);
    this.rotation = 0;
    if (this.volleyAt) {
      body.setVelocity(0, 0);
      if (time >= this.volleyAt) {
        for (let i = 0; i < this.shotCount; i++) {
          this.scene.events.emit('enemyFire', {
            x: this.x, y: this.y, angle: this.volleyAngle + (i - (this.shotCount - 1) / 2) * 0.18,
            speed: this.trial?.bulletSpeed ?? 215, damage: this.trial?.damage ?? 7, source: 'rival',
          });
        }
        this.volleyAt = 0;
        this.nextVolley = time + Math.max(900, this.temperament.fireIntervalMs + 350);
        this.telegraph?.clear();
      }
    } else {
      const direction = distance > 255 ? angle : distance < 165 ? angle + Math.PI : angle + Math.PI / 2;
      body.setVelocity(Math.cos(direction) * this.spd, Math.sin(direction) * this.spd);
      if (time >= this.nextVolley && distance < 500) {
        this.volleyAngle = angle;
        this.volleyAt = time + (this.trial?.telegraphMs ?? 650);
        body.setVelocity(0, 0);
        this.telegraph?.clear();
        this.telegraph?.lineStyle(3, 0xd17d50, 0.65);
        for (let i = 0; i < this.shotCount; i++) {
          const shotAngle = angle + (i - (this.shotCount - 1) / 2) * 0.18;
          this.telegraph?.lineBetween(this.x, this.y, this.x + Math.cos(shotAngle) * 330, this.y + Math.sin(shotAngle) * 330);
        }
      }
    }
    this.catAnimator?.update(_delta, { speed: body.velocity.length(), reducedMotion: SettingsManager.get().reducedMotion });
    this.rivalLabel?.setPosition(this.x, this.y - 43);
    this.rivalHealth?.clear().fillStyle(0x805d45, 0.22).fillRoundedRect(this.x - 26, this.y - 29, 52, 5, 2);
    this.rivalHealth?.fillStyle(0xd79866, 1).fillRoundedRect(this.x - 26, this.y - 29, 52 * Math.max(0, this.hp / this.maxHp), 5, 2);
  }

  override takeDamage(amount: number): boolean {
    if (!this.active) return false;
    // Emit before Enemy's synchronous death event destroys and removes the rival.
    const defeated = Number.isFinite(amount) && amount >= this.hp;
    if (defeated) this.scene.events.emit('shadowDefeated');
    return super.takeDamage(amount);
  }

  override destroy(fromScene?: boolean): void {
    this.rivalLabel?.destroy();
    this.telegraph?.destroy();
    this.rivalHealth?.destroy();
    this.rivalLabel = undefined;
    this.telegraph = undefined;
    this.rivalHealth = undefined;
    super.destroy(fromScene);
  }
}
