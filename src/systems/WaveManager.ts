import Phaser from 'phaser';
import { ENEMY_TYPES, WAVE_CFG, ARENA_WIDTH, ARENA_HEIGHT, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { LEVEL_WAVES, WaveDef } from '../data/enemies';
import { Enemy } from '../entities/Enemy';

export class WaveManager {
  private scene: Phaser.Scene;
  private level: number;
  wave = 0;
  private waves: WaveDef[];
  private enemies: Phaser.Physics.Arcade.Group;
  aliveCount = 0;
  private spawning = false;
  private waveActive = false;
  private pendingSpawns: Array<{ type: string; elite: boolean; boss: boolean }> = [];
  private spawnTimer = 0;
  private betweenWaves = false;
  private nextWaveAt = 0;
  allWavesDone = false;
  endlessScale = 1.0;

  constructor(scene: Phaser.Scene, level: number, enemies: Phaser.Physics.Arcade.Group) {
    this.scene = scene;
    this.level = Math.max(1, level);
    const levelIndex = Math.min(this.level, WAVE_CFG.levels) - 1;
    this.waves = LEVEL_WAVES[levelIndex] || LEVEL_WAVES[0];
    this.enemies = enemies;
    if (level > WAVE_CFG.levels) {
      this.endlessScale = 1 + (level - WAVE_CFG.levels) * 0.25;
    }
  }

  get totalWaves(): number { return this.waves.length; }

  startNextWave(): void {
    if (this.wave >= this.waves.length) {
      this.allWavesDone = true;
      this.scene.events.emit('levelComplete', { level: this.level });
      return;
    }

    const def = this.waves[this.wave];
    this.wave++;
    this.waveActive = true;
    this.spawning = true;
    this.pendingSpawns = [];

    for (const s of def.spawns) {
      const count = Phaser.Math.Between(s.min, s.max);
      for (let i = 0; i < count; i++) {
        this.pendingSpawns.push({ type: s.type, elite: s.elite ?? false, boss: false });
      }
    }
    if (def.isBoss && def.bossType) {
      this.pendingSpawns.push({ type: def.bossType, elite: true, boss: true });
    }

    Phaser.Utils.Array.Shuffle(this.pendingSpawns);
    this.aliveCount = this.pendingSpawns.length;
    this.spawnTimer = 0;

    this.scene.events.emit('waveStart', {
      wave: this.wave,
      total: this.waves.length,
      isBoss: def.isBoss,
      name: def.name,
      hint: def.hint,
    });
  }

  update(time: number, delta: number): void {
    if (this.allWavesDone) return;

    if (this.betweenWaves) {
      if (time >= this.nextWaveAt) {
        this.betweenWaves = false;
        this.startNextWave();
      }
      return;
    }

    if (this.spawning && this.pendingSpawns.length > 0) {
      this.spawnTimer += delta;
      while (this.spawnTimer >= WAVE_CFG.spawnInterval && this.pendingSpawns.length > 0) {
        this.spawnTimer -= WAVE_CFG.spawnInterval;
        const s = this.pendingSpawns.pop()!;
        this.spawnOne(s.type, s.elite, s.boss);
      }
      if (this.pendingSpawns.length === 0) this.spawning = false;
    }

    if (this.waveActive) {
      let alive = 0;
      this.enemies.getChildren().forEach(c => { if (c.active) alive++; });
      this.aliveCount = alive + this.pendingSpawns.length;
      if (!this.spawning && alive === 0) {
        this.waveActive = false;
        this.scene.events.emit('waveComplete', { wave: this.wave, total: this.waves.length });
      }
    }
  }

  scheduleNextWave(time: number): void {
    this.betweenWaves = true;
    this.nextWaveAt = time + WAVE_CFG.delayMs;
  }

  private spawnOne(type: string, elite: boolean, boss: boolean): void {
    const cfg = ENEMY_TYPES[type];
    if (!cfg) return;

    // Endless mode: random chance to become elite
    const endlessEliteChance = this.endlessScale > 1.5 ? Math.min(0.5, (this.endlessScale - 1.5) * 0.15) : 0;
    const isElite = elite || (!boss && endlessEliteChance > 0 && Math.random() < endlessEliteChance);

    const pos = this.getSpawnPos();
    const enemy = new Enemy(this.scene, pos.x, pos.y, cfg, isElite, boss);
    if (this.endlessScale > 1) {
      enemy.hp = Math.round(enemy.hp * this.endlessScale);
      enemy.maxHp = enemy.hp;
      enemy.dmg = Math.round(enemy.dmg * (1 + (this.endlessScale - 1) * 0.6));
      enemy.spd *= (1 + (this.endlessScale - 1) * 0.2);
    }
    if (type === 'slime' && (isElite || this.endlessScale > 1.2)) {
      enemy.canSplit = true;
    }
    this.enemies.add(enemy);
  }

  private getSpawnPos(): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const margin = WAVE_CFG.spawnMargin;
    const side = Phaser.Math.Between(0, 3);
    let x: number, y: number;

    switch (side) {
      case 0:
        x = Phaser.Math.Between(cam.scrollX - margin, cam.scrollX + GAME_WIDTH + margin);
        y = cam.scrollY - margin;
        break;
      case 1:
        x = cam.scrollX + GAME_WIDTH + margin;
        y = Phaser.Math.Between(cam.scrollY - margin, cam.scrollY + GAME_HEIGHT + margin);
        break;
      case 2:
        x = Phaser.Math.Between(cam.scrollX - margin, cam.scrollX + GAME_WIDTH + margin);
        y = cam.scrollY + GAME_HEIGHT + margin;
        break;
      default:
        x = cam.scrollX - margin;
        y = Phaser.Math.Between(cam.scrollY - margin, cam.scrollY + GAME_HEIGHT + margin);
        break;
    }

    x = Phaser.Math.Clamp(x, 30, ARENA_WIDTH - 30);
    y = Phaser.Math.Clamp(y, 30, ARENA_HEIGHT - 30);
    return { x, y };
  }
}
