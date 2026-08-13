import Phaser from 'phaser';
import {
  GAME_WIDTH, GAME_HEIGHT, ARENA_WIDTH, ARENA_HEIGHT,
  COLORS, HERO_CFG,
} from '../config/gameConfig';
import { CATEGORY_COLORS } from '../data/upgrades';
import { Hero, FireEvent } from '../entities/Hero';
import { Enemy } from '../entities/Enemy';
import { Projectile, BulletOpts } from '../entities/Projectile';
import { WaveManager } from '../systems/WaveManager';
import { UpgradeManager } from '../systems/UpgradeManager';
import type { UpgradeDef } from '../data/upgrades';

const MAX_PARTICLES = 30;

export class ArenaScene extends Phaser.Scene {
  private hero!: Hero;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private xpGems!: Phaser.Physics.Arcade.Group;

  private waveMgr!: WaveManager;
  private upgradeMgr!: UpgradeManager;

  /* ── UI objects ── */
  private hpGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;
  private enemyHpGfx!: Phaser.GameObjects.Graphics;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private offscreenGfx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private waveProgressGfx!: Phaser.GameObjects.Graphics;

  /* ── State ── */
  private score = 0;
  private kills = 0;
  private currentLevel = 1;
  private upgrading = false;
  private dead = false;
  private upgradeUI: Phaser.GameObjects.GameObject[] = [];

  /* ── Hitlag (frame-based, no setTimeout) ── */
  private hitlagEndTime = 0;

  /* ── Combo system ── */
  private comboCount = 0;
  private comboResetTime = 0;
  private readonly comboDuration = 2000;

  /* ── Effect pool tracking ── */
  private activeParticleCount = 0;

  /* ── Wave tracking ── */
  private waveEnemyTotal = 0;

  constructor() { super('ArenaScene'); }

  init(data: { level?: number; score?: number }) {
    this.currentLevel = data.level || 1;
    this.score = data.score || 0;
    this.kills = 0;
    this.upgrading = false;
    this.dead = false;
    this.comboCount = 0;
    this.hitlagEndTime = 0;
    this.activeParticleCount = 0;
    this.waveEnemyTotal = 0;
    if (this.currentLevel === 1) {
      this.registry.remove('appliedUpgrades');
    }
  }

  create() {
    this.drawArena();
    this.physics.world.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.physics.world.timeScale = 1;

    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.playerBullets = this.physics.add.group({ runChildUpdate: false });
    this.enemyBullets = this.physics.add.group({ runChildUpdate: false });
    this.xpGems = this.physics.add.group({ runChildUpdate: false });

    this.hero = new Hero(this, ARENA_WIDTH / 2, ARENA_HEIGHT / 2);

    this.setupCollisions();
    this.setupCamera();
    this.createUI();
    this.bindEvents();

    this.upgradeMgr = new UpgradeManager();

    const saved = this.registry.get('appliedUpgrades') as string[] | undefined;
    if (saved) {
      for (const id of saved) this.upgradeMgr.applyById(this.hero, id);
    }

    this.waveMgr = new WaveManager(this, this.currentLevel, this.enemies);
    this.waveMgr.startNextWave();

    this.input.mouse!.disableContextMenu();
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown()) this.hero.dash(this.time.now);
    });
  }

  /* ────────────────── Arena Drawing ────────────────── */

  private drawArena(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.arenaBg);
    g.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    g.lineStyle(1, COLORS.arenaGrid, 0.12);
    for (let x = 0; x <= ARENA_WIDTH; x += 80) g.lineBetween(x, 0, x, ARENA_HEIGHT);
    for (let y = 0; y <= ARENA_HEIGHT; y += 80) g.lineBetween(0, y, ARENA_WIDTH, y);

    // corner decorations
    const corners = [
      [40, 40], [ARENA_WIDTH - 40, 40],
      [40, ARENA_HEIGHT - 40], [ARENA_WIDTH - 40, ARENA_HEIGHT - 40],
    ];
    for (const [cx, cy] of corners) {
      g.lineStyle(2, 0x1e3a5f, 0.3);
      g.strokeCircle(cx, cy, 30);
      g.fillStyle(0x1e3a5f, 0.08);
      g.fillCircle(cx, cy, 30);
    }

    // subtle radial gradient center
    for (let r = 200; r > 0; r -= 40) {
      g.fillStyle(0x1a2744, 0.02);
      g.fillCircle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, r);
    }

    g.lineStyle(3, COLORS.arenaBorder, 0.8);
    g.strokeRect(2, 2, ARENA_WIDTH - 4, ARENA_HEIGHT - 4);
    g.lineStyle(1, 0x2563eb, 0.15);
    g.strokeRect(8, 8, ARENA_WIDTH - 16, ARENA_HEIGHT - 16);
    g.setDepth(-1);
  }

  /* ────────────────── Physics ────────────────── */

  private setupCollisions(): void {
    this.physics.add.overlap(this.playerBullets, this.enemies,
      this.onBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.hero,
      this.onEnemyBulletHitHero as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.hero, this.enemies,
      this.onHeroTouchEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.hero, this.xpGems,
      this.onCollectGem as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
  }

  private onBulletHitEnemy(bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    const bullet = bulletObj as unknown as Projectile;
    const enemy = enemyObj as unknown as Enemy;
    if (!bullet.active || !enemy.active) return;

    if (bullet.piercing) {
      if (bullet.hitSet.has(enemy)) return;
      bullet.hitSet.add(enemy);
    } else {
      bullet.destroy();
    }

    enemy.knockback(bullet.x, bullet.y, 60);
    const killed = enemy.takeDamage(bullet.damage);
    this.showDmgNum(enemy.x, enemy.y - 20, bullet.damage);
    this.hitParticles(enemy.x, enemy.y, enemy.cfg.color);

    if (!killed) {
      this.cameras.main.shake(40, 0.002);
    }
  }

  private onEnemyBulletHitHero(bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, _heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    const bullet = bulletObj as unknown as Projectile;
    if (!bullet.active) return;
    bullet.destroy();
    this.hero.takeDamage(bullet.damage);
  }

  private onHeroTouchEnemy(_heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    const enemy = enemyObj as unknown as Enemy;
    if (!enemy.active) return;

    if (this.hero.isDashing && this.hero.dashDamage > 0) {
      enemy.takeDamage(this.hero.dashDamage);
      enemy.knockback(this.hero.x, this.hero.y, 100);
      return;
    }

    this.hero.takeDamage(enemy.dmg);
  }

  private onCollectGem(_heroObj: Phaser.Types.Physics.Arcade.GameObjectWithBody, gemObj: Phaser.Types.Physics.Arcade.GameObjectWithBody): void {
    const gem = gemObj as unknown as Phaser.Physics.Arcade.Sprite;
    if (!gem.active) return;
    const xpVal = gem.getData('xp') as number || 5;
    this.score += xpVal;
    this.hero.addCharge(Math.round(xpVal * 0.5));
    this.collectParticles(gem.x, gem.y);
    gem.destroy();
  }

  /* ────────────────── Camera ────────────────── */

  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.cameras.main.startFollow(this.hero, true, 0.09, 0.09);
    this.cameras.main.setBackgroundColor(COLORS.bg);
  }

  /* ────────────────── UI Creation ────────────────── */

  private createUI(): void {
    const ts: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: '14px', fontFamily: 'monospace', color: COLORS.uiText };
    const tsB: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: '15px', fontFamily: 'monospace', color: COLORS.uiAccent, fontStyle: 'bold' };
    const tsS: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: '9px', fontFamily: 'monospace', color: '#6b7280' };

    this.hpGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.barGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.enemyHpGfx = this.add.graphics().setDepth(50);

    this.hpText = this.add.text(90, 18, '', { fontSize: '10px', fontFamily: 'monospace', color: '#fff', fontStyle: 'bold' })
      .setScrollFactor(0).setDepth(101).setOrigin(0.5);

    this.add.text(174, 18, 'HP', tsS).setScrollFactor(0).setDepth(101).setOrigin(0, 0.5);
    this.add.text(10, 34, '蓄力', tsS).setScrollFactor(0).setDepth(101).setOrigin(0, 0.5);
    this.add.text(118, 34, '闪避', tsS).setScrollFactor(0).setDepth(101).setOrigin(0, 0.5);

    this.waveText = this.add.text(GAME_WIDTH / 2, 6, '', tsB).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);
    this.scoreText = this.add.text(GAME_WIDTH - 8, 6, '', ts).setScrollFactor(0).setDepth(100).setOrigin(1, 0);
    this.infoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 10, '', { fontSize: '13px', fontFamily: 'monospace', color: COLORS.uiAccent, fontStyle: 'bold' })
      .setScrollFactor(0).setDepth(100).setOrigin(0.5, 1);

    this.comboText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, '', {
      fontSize: '20px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fbbf24',
      stroke: '#000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(105).setOrigin(0.5).setAlpha(0);

    this.waveProgressGfx = this.add.graphics().setScrollFactor(0).setDepth(99);
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(110);
    this.offscreenGfx = this.add.graphics().setScrollFactor(0).setDepth(95);
  }

  /* ────────────────── UI Update ────────────────── */

  private updateUI(time: number): void {
    const g = this.hpGfx;
    g.clear();

    // HP bar
    const bw = 160, bh = 14, bx = 10, by = 10;
    g.fillStyle(0x1a1a2e); g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.fillStyle(COLORS.hpBg); g.fillRect(bx, by, bw, bh);
    const pct = this.hero.hp / this.hero.maxHp;
    const hpColor = pct > 0.5 ? COLORS.hpGreen : pct > 0.25 ? 0xeab308 : COLORS.hpRed;
    g.fillStyle(hpColor);
    g.fillRect(bx, by, bw * pct, bh);
    if (pct <= 0.25) {
      g.fillStyle(0xff0000, 0.15 + Math.sin(time * 0.008) * 0.1);
      g.fillRect(bx, by, bw * pct, bh);
    }
    g.lineStyle(1, 0x4b5563); g.strokeRect(bx, by, bw, bh);
    this.hpText.setText(`${this.hero.hp} / ${this.hero.maxHp}`);

    // Charge & Dash bars
    const cg = this.barGfx;
    cg.clear();
    const cx = 30, cy = 29, cw = 82, ch = 9;
    cg.fillStyle(0x1a1a2e); cg.fillRect(cx - 1, cy - 1, cw + 2, ch + 2);
    cg.fillStyle(COLORS.hpBg); cg.fillRect(cx, cy, cw, ch);
    const chargePct = this.hero.charge / this.hero.chargeMax;
    cg.fillStyle(chargePct >= 1 ? 0xf59e0b : COLORS.chargeBar);
    cg.fillRect(cx, cy, cw * chargePct, ch);
    if (chargePct >= 1) {
      cg.fillStyle(0xffffff, 0.15 + Math.sin(time * 0.006) * 0.1);
      cg.fillRect(cx, cy, cw, ch);
    }
    cg.lineStyle(1, 0x4b5563); cg.strokeRect(cx, cy, cw, ch);

    const dashPct = this.hero.dashCooldownPct(time);
    const dx = 142, dy = 29;
    cg.fillStyle(0x1a1a2e); cg.fillRect(dx - 1, dy - 1, 42, ch + 2);
    cg.fillStyle(COLORS.hpBg); cg.fillRect(dx, dy, 40, ch);
    cg.fillStyle(dashPct >= 1 ? 0x60a5fa : 0x2d3748);
    cg.fillRect(dx, dy, 40 * dashPct, ch);
    cg.lineStyle(1, 0x4b5563); cg.strokeRect(dx, dy, 40, ch);

    if (this.hero.hasShield) {
      cg.lineStyle(2, 0x60a5fa, 0.5 + Math.sin(time * 0.004) * 0.2);
      cg.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 38);
    }

    // Wave & Score text
    this.waveText.setText(`关卡 ${this.currentLevel}  波次 ${this.waveMgr.wave}/10  剩余 ${this.waveMgr.aliveCount}`);
    this.scoreText.setText(`分数 ${this.score}  击杀 ${this.kills}`);

    // Tips
    const tips: string[] = [];
    if (this.hero.charge >= this.hero.chargeMax) tips.push('[ SPACE ] 蓄力释放!');
    if (dashPct >= 1) tips.push('[ SHIFT ] 闪避就绪');
    this.infoText.setText(tips.join('    '));

    // Wave progress bar (top of screen)
    this.drawWaveProgress();

    // Off-screen enemy indicators
    this.drawOffscreenIndicators();

    // Minimap
    this.drawMinimap();

    // Enemy HP bars
    this.drawEnemyHpBars();

    // Combo
    this.updateCombo(time);
  }

  private drawWaveProgress(): void {
    const pg = this.waveProgressGfx;
    pg.clear();
    const pw = GAME_WIDTH - 20, ph = 3;
    const px = 10, py = GAME_HEIGHT - 4;
    pg.fillStyle(0x1e293b, 0.6); pg.fillRect(px, py, pw, ph);
    if (this.waveEnemyTotal > 0) {
      const alive = this.waveMgr.aliveCount;
      const killed = this.waveEnemyTotal - alive;
      const progress = killed / this.waveEnemyTotal;
      pg.fillStyle(0x3b82f6, 0.7); pg.fillRect(px, py, pw * progress, ph);
    }
  }

  private drawOffscreenIndicators(): void {
    const og = this.offscreenGfx;
    og.clear();
    const cam = this.cameras.main;
    const margin = 20;

    for (const c of this.enemies.getChildren()) {
      const e = c as Enemy;
      if (!e.active) continue;
      const sx = e.x - cam.scrollX;
      const sy = e.y - cam.scrollY;

      if (sx >= -10 && sx <= GAME_WIDTH + 10 && sy >= -10 && sy <= GAME_HEIGHT + 10) continue;

      const a = Math.atan2(sy - GAME_HEIGHT / 2, sx - GAME_WIDTH / 2);
      const cos = Math.cos(a), sin = Math.sin(a);

      let ix: number, iy: number;
      const hw = GAME_WIDTH / 2 - margin, hh = GAME_HEIGHT / 2 - margin;
      const t = Math.min(
        Math.abs(cos) > 0.001 ? hw / Math.abs(cos) : 9999,
        Math.abs(sin) > 0.001 ? hh / Math.abs(sin) : 9999,
      );
      ix = GAME_WIDTH / 2 + cos * t;
      iy = GAME_HEIGHT / 2 + sin * t;

      const color = e.isBoss ? 0xef4444 : (e.isElite ? 0xfbbf24 : e.cfg.color);
      const sz = e.isBoss ? 7 : 5;

      og.fillStyle(color, 0.85);
      og.fillTriangle(
        ix + cos * sz, iy + sin * sz,
        ix + Math.cos(a + 2.3) * sz, iy + Math.sin(a + 2.3) * sz,
        ix + Math.cos(a - 2.3) * sz, iy + Math.sin(a - 2.3) * sz,
      );
    }
  }

  private drawMinimap(): void {
    const mg = this.minimapGfx;
    mg.clear();

    const mw = 100, mh = 75;
    const mx = GAME_WIDTH - mw - 6, my = GAME_HEIGHT - mh - 8;
    const sx = mw / ARENA_WIDTH, sy = mh / ARENA_HEIGHT;

    mg.fillStyle(0x0a0e17, 0.7); mg.fillRect(mx, my, mw, mh);
    mg.lineStyle(1, 0x374151, 0.6); mg.strokeRect(mx, my, mw, mh);

    // camera viewport
    const cam = this.cameras.main;
    mg.lineStyle(1, 0x475569, 0.5);
    mg.strokeRect(mx + cam.scrollX * sx, my + cam.scrollY * sy, GAME_WIDTH * sx, GAME_HEIGHT * sy);

    // enemies
    for (const c of this.enemies.getChildren()) {
      const e = c as Enemy;
      if (!e.active) continue;
      mg.fillStyle(e.isBoss ? 0xef4444 : e.cfg.color, 0.8);
      mg.fillRect(mx + e.x * sx - 1, my + e.y * sy - 1, e.isBoss ? 3 : 2, e.isBoss ? 3 : 2);
    }

    // xp gems
    mg.fillStyle(0x818cf8, 0.4);
    for (const c of this.xpGems.getChildren()) {
      const gem = c as Phaser.Physics.Arcade.Sprite;
      if (gem.active) mg.fillRect(mx + gem.x * sx, my + gem.y * sy, 1, 1);
    }

    // hero
    mg.fillStyle(0x3b82f6); mg.fillCircle(mx + this.hero.x * sx, my + this.hero.y * sy, 3);
    mg.lineStyle(1, 0x93c5fd, 0.6); mg.strokeCircle(mx + this.hero.x * sx, my + this.hero.y * sy, 3);
  }

  private drawEnemyHpBars(): void {
    this.enemyHpGfx.clear();
    for (const c of this.enemies.getChildren()) {
      const e = c as Enemy;
      if (!e.active) continue;
      const w = e.isBoss ? 60 : 28;
      const h = e.isBoss ? 6 : 3;
      const ex = e.x - w / 2;
      const ey = e.y - e.cfg.bodyRadius * e.scaleY - 10;
      const ep = e.hp / e.maxHp;
      this.enemyHpGfx.fillStyle(0x000000, 0.4); this.enemyHpGfx.fillRect(ex - 1, ey - 1, w + 2, h + 2);
      this.enemyHpGfx.fillStyle(COLORS.hpBg); this.enemyHpGfx.fillRect(ex, ey, w, h);
      this.enemyHpGfx.fillStyle(ep > 0.3 ? COLORS.hpGreen : COLORS.hpRed);
      this.enemyHpGfx.fillRect(ex, ey, w * ep, h);
    }
  }

  private updateCombo(time: number): void {
    if (this.comboCount > 1 && time < this.comboResetTime) {
      const remaining = (this.comboResetTime - time) / this.comboDuration;
      this.comboText.setText(`${this.comboCount}x COMBO!`);
      this.comboText.setAlpha(Math.min(1, remaining * 3));
      const s = 1 + Math.min(this.comboCount * 0.05, 0.4);
      this.comboText.setScale(s);
    } else if (this.comboCount > 0 && time >= this.comboResetTime) {
      this.comboCount = 0;
      this.comboText.setAlpha(0);
    }
  }

  private addCombo(): void {
    this.comboCount++;
    this.comboResetTime = this.time.now + this.comboDuration;
    if (this.comboCount >= 3) {
      const bonus = this.comboCount * 2;
      this.score += bonus;
    }
  }

  /* ────────────────── Events ────────────────── */

  private bindEvents(): void {
    this.events.on('heroFire', this.onHeroFire, this);
    this.events.on('enemyFire', this.onEnemyFire, this);
    this.events.on('heroDash', this.onDash, this);
    this.events.on('heroBlast', this.onBlast, this);
    this.events.on('heroHit', this.onHeroHit, this);
    this.events.on('heroDeath', this.onHeroDeath, this);
    this.events.on('shieldBreak', this.onShieldBreak, this);
    this.events.on('enemyDeath', this.onEnemyDeath, this);
    this.events.on('waveStart', this.onWaveStart, this);
    this.events.on('waveComplete', this.onWaveComplete, this);
    this.events.on('levelComplete', this.onLevelComplete, this);
  }

  private onHeroFire(ev: FireEvent): void {
    if (ev.count <= 1) {
      this.spawnBullet({ x: ev.x, y: ev.y, angle: ev.angle, speed: ev.speed, damage: ev.damage, piercing: ev.piercing, homing: ev.homing, owner: 'player' });
    } else {
      const half = (ev.count - 1) / 2;
      for (let i = 0; i < ev.count; i++) {
        const a = ev.angle + (i - half) * ev.spreadAngle;
        this.spawnBullet({ x: ev.x, y: ev.y, angle: a, speed: ev.speed, damage: ev.damage, piercing: ev.piercing, homing: ev.homing, owner: 'player' });
      }
    }
    this.muzzleFlash(ev.x, ev.y);
  }

  private muzzleFlash(x: number, y: number): void {
    const flash = this.add.circle(x, y, 8, 0xfbbf24, 0.6).setDepth(12);
    this.tweens.add({ targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0, duration: 70, onComplete: () => flash.destroy() });
  }

  private onEnemyFire(ev: { x: number; y: number; angle: number; speed: number; damage: number }): void {
    this.spawnBullet({ x: ev.x, y: ev.y, angle: ev.angle, speed: ev.speed, damage: ev.damage, owner: 'enemy' });
  }

  private spawnBullet(opts: BulletOpts): void {
    const b = new Projectile(this, opts);
    if (opts.owner === 'player') {
      this.playerBullets.add(b);
    } else {
      this.enemyBullets.add(b);
    }
    b.launch();
  }

  private onDash(ev: { x: number; y: number; angle: number }): void {
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(i * 40, () => {
        const trail = this.add.sprite(
          ev.x + Math.cos(ev.angle) * i * 14,
          ev.y + Math.sin(ev.angle) * i * 14,
          'hero',
        );
        trail.setAlpha(0.35 - i * 0.08).setDepth(9).setTint(0x93c5fd);
        this.tweens.add({ targets: trail, alpha: 0, duration: 180, onComplete: () => trail.destroy() });
      });
    }
  }

  private onBlast(ev: { x: number; y: number; radius: number; damage: number }): void {
    const circle = this.add.graphics();
    circle.fillStyle(COLORS.chargeBar, 0.25);
    circle.fillCircle(ev.x, ev.y, ev.radius);
    circle.lineStyle(3, COLORS.chargeBar, 0.9);
    circle.strokeCircle(ev.x, ev.y, ev.radius);
    circle.setDepth(15);
    this.tweens.add({ targets: circle, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 350, onComplete: () => circle.destroy() });
    this.cameras.main.shake(120, 0.007);
    this.cameras.main.flash(100, 255, 191, 0, true);

    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (!e.active) return;
      if (Phaser.Math.Distance.Between(ev.x, ev.y, e.x, e.y) < ev.radius + e.cfg.bodyRadius) {
        e.takeDamage(ev.damage);
        e.knockback(ev.x, ev.y, 150);
        this.showDmgNum(e.x, e.y - 20, ev.damage);
      }
    });
  }

  private onHeroHit(ev: { x: number; y: number; damage: number }): void {
    this.cameras.main.shake(80, 0.005);
    this.cameras.main.flash(60, 255, 0, 0, true);
    this.showDmgNum(ev.x, ev.y - 20, ev.damage, true);
    this.hitParticles(ev.x, ev.y, 0xef4444);

    this.hero.setTintFill(0xff4444);
    this.time.delayedCall(80, () => {
      if (this.hero.active) this.hero.clearTint();
    });
  }

  private onHeroDeath(): void {
    this.dead = true;
    this.cameras.main.shake(300, 0.012);
    this.cameras.main.flash(200, 255, 0, 0, true);
    this.deathParticles(this.hero.x, this.hero.y);

    this.time.delayedCall(1500, () => {
      this.scene.start('GameOverScene', { score: this.score, kills: this.kills, wave: this.waveMgr.wave, level: this.currentLevel });
    });
  }

  private onShieldBreak(ev: { x: number; y: number }): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(ev.x, ev.y, 'particle_white', {
      speed: { min: 80, max: 200 }, scale: { start: 1.5, end: 0 },
      lifespan: 400, tint: 0x60a5fa, quantity: 10, emitting: false,
    });
    emitter.explode(10); emitter.setDepth(20);
    this.time.delayedCall(500, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private onEnemyDeath(ev: { x: number; y: number; xp: number; score: number; color: number; isBoss: boolean }): void {
    this.kills++;
    this.score += ev.score;
    this.hero.addCharge(this.hero.chargePerKill);
    this.addCombo();

    this.deathParticles(ev.x, ev.y, ev.color);

    if (ev.isBoss) {
      this.cameras.main.shake(200, 0.009);
      this.cameras.main.flash(150, 255, 200, 0, true);
      this.hitlag(80);
    } else {
      this.cameras.main.shake(50, 0.003);
      this.hitlag(35);
    }

    this.spawnXpGem(ev.x, ev.y, ev.xp);
  }

  private onWaveStart(ev: { wave: number; total: number; isBoss?: boolean }): void {
    this.waveEnemyTotal = this.waveMgr.aliveCount;
    if (ev.isBoss) {
      this.announce('⚠ BOSS 来袭！', 0xef4444, 2000);
      this.cameras.main.shake(300, 0.004);
    } else {
      this.announce(`波次 ${ev.wave}`, 0xfbbf24, 1000);
    }
  }

  private onWaveComplete(ev: { wave: number; total: number }): void {
    if (ev.wave >= ev.total) {
      this.waveMgr.scheduleNextWave(this.time.now);
      return;
    }
    this.showUpgradeUI('wave');
  }

  private onLevelComplete(ev: { level: number }): void {
    if (ev.level >= 3) {
      this.announce('🏆 胜利！', 0x22c55e, 2500);
      this.time.delayedCall(3000, () => {
        this.scene.start('GameOverScene', { score: this.score, kills: this.kills, wave: 10, level: ev.level, victory: true });
      });
      return;
    }
    this.hero.heal(this.hero.maxHp);
    this.announce(`关卡 ${ev.level} 通过！`, 0x22c55e, 2000);
    this.time.delayedCall(2500, () => this.showUpgradeUI('level'));
  }

  /* ────────────────── XP Gems ────────────────── */

  private spawnXpGem(x: number, y: number, xp: number): void {
    const gem = this.physics.add.sprite(x, y, 'xp_gem');
    gem.setDepth(2); gem.setData('xp', xp);
    (gem.body as Phaser.Physics.Arcade.Body).setCircle(5, 3, 3);
    this.xpGems.add(gem);

    gem.setScale(0);
    this.tweens.add({ targets: gem, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: gem, alpha: { from: 1, to: 0.5 },
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private magnetXpGems(): void {
    for (const c of this.xpGems.getChildren()) {
      const gem = c as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) continue;
      const d = Phaser.Math.Distance.Between(gem.x, gem.y, this.hero.x, this.hero.y);
      if (d < this.hero.magnetRadius) {
        const a = Phaser.Math.Angle.Between(gem.x, gem.y, this.hero.x, this.hero.y);
        const spd = 280 + (this.hero.magnetRadius - d) * 5;
        (gem.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
      }
    }
  }

  /* ────────────────── Effects ────────────────── */

  private showDmgNum(x: number, y: number, dmg: number, isHero = false): void {
    const t = this.add.text(x + Phaser.Math.Between(-8, 8), y, `${Math.round(dmg)}`, {
      fontSize: isHero ? '16px' : '13px',
      fontFamily: 'monospace',
      color: isHero ? '#ff6b6b' : '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  private hitParticles(x: number, y: number, color: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(x, y, 'particle_white', {
      speed: { min: 50, max: 140 }, scale: { start: 0.9, end: 0 },
      lifespan: 200, tint: color, quantity: 3, emitting: false,
    });
    emitter.explode(3); emitter.setDepth(20);
    this.time.delayedCall(250, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private deathParticles(x: number, y: number, color?: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(x, y, 'particle_white', {
      speed: { min: 70, max: 220 }, scale: { start: 1.3, end: 0 },
      lifespan: 450, tint: color ?? 0xffffff, quantity: 8, emitting: false,
    });
    emitter.explode(8); emitter.setDepth(20);
    this.time.delayedCall(500, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private hitlag(ms: number): void {
    if (this.hitlagEndTime > 0) return;
    this.hitlagEndTime = this.time.now + ms;
    this.physics.world.timeScale = 8;
  }

  private collectParticles(x: number, y: number): void {
    if (this.activeParticleCount >= MAX_PARTICLES) return;
    this.activeParticleCount++;
    const emitter = this.add.particles(x, y, 'particle_yellow', {
      speed: { min: 30, max: 90 }, scale: { start: 1, end: 0 },
      lifespan: 250, quantity: 4, emitting: false,
    });
    emitter.explode(4); emitter.setDepth(20);
    this.time.delayedCall(300, () => { emitter.destroy(); this.activeParticleCount--; });
  }

  private announce(text: string, color: number, dur: number): void {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, text, {
      fontSize: '32px', fontFamily: 'monospace', fontStyle: 'bold',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0).setScale(0.5);
    this.tweens.add({
      targets: t, alpha: 1, scaleX: 1, scaleY: 1, duration: 250, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 25, delay: dur - 400, duration: 400, onComplete: () => t.destroy() });
      },
    });
  }

  /* ────────────────── Upgrade UI ────────────────── */

  private showUpgradeUI(pool: 'wave' | 'level'): void {
    this.upgrading = true;
    this.physics.pause();

    const choices = this.upgradeMgr.pickThree(pool);
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.65)
      .setScrollFactor(0).setDepth(300);
    this.upgradeUI.push(overlay);

    const title = pool === 'level' ? '永久强化选择' : '升级选择';
    const titleText = this.add.text(GAME_WIDTH / 2, 55, title, {
      fontSize: '26px', fontFamily: 'monospace', fontStyle: 'bold', color: COLORS.uiAccent,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.upgradeUI.push(titleText);

    const cardW = 200, cardH = 240, gap = 20;
    const totalW = cardW * 3 + gap * 2;
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;

    choices.forEach((upg, i) => {
      const cx = startX + i * (cardW + gap);
      const cy = GAME_HEIGHT / 2 + 20;
      const catColor = CATEGORY_COLORS[upg.category] || 0xffffff;

      const card = this.add.graphics().setScrollFactor(0).setDepth(301);
      this.drawCard(card, cx, cy, cardW, cardH, catColor, false);
      this.upgradeUI.push(card);

      const rarityLabel = upg.rarity === 'epic' ? '稀有' : upg.rarity === 'rare' ? '精良' : '普通';
      const rarityColor = upg.rarity === 'epic' ? '#fbbf24' : upg.rarity === 'rare' ? '#818cf8' : '#9ca3af';
      const rt = this.add.text(cx, cy - cardH / 2 + 22, rarityLabel, {
        fontSize: '11px', fontFamily: 'monospace', color: rarityColor,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(rt);

      const iconG = this.add.graphics().setScrollFactor(0).setDepth(302);
      iconG.fillStyle(catColor, 0.25); iconG.fillCircle(cx, cy - 40, 26);
      iconG.fillStyle(catColor); iconG.fillCircle(cx, cy - 40, 14);
      iconG.lineStyle(1, catColor, 0.4); iconG.strokeCircle(cx, cy - 40, 26);
      this.upgradeUI.push(iconG);

      const nt = this.add.text(cx, cy + 10, upg.name, {
        fontSize: '17px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(nt);

      const dt = this.add.text(cx, cy + 40, upg.desc, {
        fontSize: '12px', fontFamily: 'monospace', color: '#d1d5db',
        wordWrap: { width: cardW - 24 }, align: 'center',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(302);
      this.upgradeUI.push(dt);

      const hitArea = this.add.rectangle(cx, cy, cardW, cardH, 0xffffff, 0)
        .setScrollFactor(0).setDepth(303).setInteractive({ useHandCursor: true });
      this.upgradeUI.push(hitArea);

      hitArea.on('pointerover', () => this.drawCard(card, cx, cy, cardW, cardH, catColor, true));
      hitArea.on('pointerout', () => this.drawCard(card, cx, cy, cardW, cardH, catColor, false));
      hitArea.on('pointerdown', () => this.selectUpgrade(upg, pool));
    });
  }

  private drawCard(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, h: number, catColor: number, hover: boolean): void {
    g.clear();
    g.fillStyle(hover ? COLORS.cardHover : COLORS.cardBg);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    g.fillStyle(catColor, 0.8);
    g.fillRect(cx - w / 2, cy - h / 2, w, 5);
    g.lineStyle(2, hover ? catColor : COLORS.cardBorder);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
  }

  private selectUpgrade(upg: UpgradeDef, pool: 'wave' | 'level'): void {
    this.upgradeMgr.apply(this.hero, upg);
    this.clearUpgradeUI();
    this.announce(`获得: ${upg.name}`, CATEGORY_COLORS[upg.category] || 0xffffff, 1000);
    this.upgrading = false;
    this.physics.resume();

    if (pool === 'level') {
      this.registry.set('appliedUpgrades', this.upgradeMgr.getAppliedIds());
      this.time.delayedCall(1200, () => {
        this.scene.restart({ level: this.currentLevel + 1, score: this.score });
      });
    } else {
      this.waveMgr.scheduleNextWave(this.time.now);
    }
  }

  private clearUpgradeUI(): void {
    this.upgradeUI.forEach(obj => obj.destroy());
    this.upgradeUI = [];
  }

  /* ────────────────── Main Update Loop ────────────────── */

  update(time: number, delta: number) {
    if (this.dead || this.upgrading) return;

    // Hitlag recovery (frame-based, never hangs)
    if (this.hitlagEndTime > 0 && time >= this.hitlagEndTime) {
      this.physics.world.timeScale = 1;
      this.hitlagEndTime = 0;
    }

    this.hero.tick(time, delta);
    this.updateEnemies(time, delta);
    this.updateBullets(time);
    this.magnetXpGems();
    this.waveMgr.update(time, delta);
    this.updateUI(time);

    if (this.hero.isInvincible && !this.hero.isDashing) {
      this.hero.setAlpha(Math.sin(time * 0.02) * 0.3 + 0.7);
    } else if (!this.hero.isDashing && this.hero.alpha !== 1) {
      this.hero.setAlpha(1);
    }
  }

  private updateEnemies(time: number, delta: number): void {
    [...this.enemies.getChildren()].forEach(c => {
      const e = c as Enemy;
      if (e.active) e.tick(time, delta, this.hero.x, this.hero.y);
    });
  }

  private updateBullets(time: number): void {
    let nearX: number | undefined, nearY: number | undefined;
    if (this.hero.bulletHoming) {
      let minD = Infinity;
      for (const c of this.enemies.getChildren()) {
        const e = c as Enemy;
        if (!e.active) continue;
        const d = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, e.x, e.y);
        if (d < minD) { minD = d; nearX = e.x; nearY = e.y; }
      }
    }

    [...this.playerBullets.getChildren()].forEach(c => {
      const b = c as Projectile;
      if (b.active) {
        if (b.homing && nearX !== undefined && nearY !== undefined) {
          b.homeToward(nearX, nearY);
        }
        b.tick(time);
      }
    });

    [...this.enemyBullets.getChildren()].forEach(c => {
      const b = c as Projectile;
      if (b.active) b.tick(time);
    });
  }
}
