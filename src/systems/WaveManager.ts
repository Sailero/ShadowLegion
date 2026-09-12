import Phaser from 'phaser';
import { ENEMY_TYPES, WAVE_CFG, ARENA_WIDTH, ARENA_HEIGHT, MAX_ACTIVE_ENEMIES, normalizeRunLevel } from '../config/gameConfig';
import { LEVEL_WAVES, WaveDef } from '../data/enemies';
import { ChapterDef, getChapter } from '../data/chapters';
import { Enemy } from '../entities/Enemy';
import { getStage, getStageChapter, type StageWaveDef } from '../data/stages';
import { getShadowTrialWaves, type GameMode } from '../data/modes';

export class WaveManager {
  private scene: Phaser.Scene;
  private level: number;
  wave = 0;
  private waves: WaveDef[];
  private enemies: Phaser.Physics.Arcade.Group;
  private chapter: ChapterDef;
  aliveCount = 0;
  private spawning = false;
  private waveActive = false;
  private pendingSpawns: Array<{ type: string; elite: boolean; boss: boolean; bossName?: string; laneIndex: number }> = [];
  private spawnTimer = 0;
  private betweenWaves = false;
  private nextWaveAt = 0;
  allWavesDone = false;
  endlessScale = 1.0;
  private mode: GameMode;
  private spawnIntervalMs = WAVE_CFG.spawnInterval;

  constructor(scene: Phaser.Scene, level: number, enemies: Phaser.Physics.Arcade.Group, endless = false, options: { mode?: GameMode; stageId?: number; trialTier?: number } = {}) {
    this.scene = scene;
    this.level = normalizeRunLevel(level, endless);
    const levelIndex = endless
      ? (this.level - 1) % WAVE_CFG.levels
      : Math.min(this.level, WAVE_CFG.levels) - 1;
    this.waves = LEVEL_WAVES[levelIndex] || LEVEL_WAVES[0];
    this.chapter = getChapter(this.level, endless);
    this.mode = options.mode ?? (endless ? 'endless' : 'campaign');
    if (this.mode === 'campaign' && options.stageId) {
      this.waves = getStage(options.stageId).waves;
      this.chapter = getStageChapter(options.stageId);
    } else if (this.mode === 'shadow') this.waves = getShadowTrialWaves(options.trialTier ?? 1);
    this.enemies = enemies;
    if (endless && this.level > WAVE_CFG.levels) {
      this.endlessScale = 1 + Math.floor((this.level - 1) / WAVE_CFG.levels) * 0.22;
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
    this.spawnIntervalMs = (def as StageWaveDef).spawnIntervalMs ?? WAVE_CFG.spawnInterval;
    this.wave++;
    this.waveActive = true;
    this.spawning = true;
    this.pendingSpawns = [];
    // The first encounter teaches one readable route. Later waves alternate
    // evenly between the announced entrances instead of randomly piling up.
    const plannedLanes = (def as StageWaveDef).lanes;
    const laneIndices = plannedLanes?.length ? plannedLanes.filter(index => this.chapter.spawnPoints[index]) : this.chapter.id === 1 && this.wave === 1
      ? [0]
      : this.chapter.spawnPoints.map((_, index) => (index + this.wave - 1) % this.chapter.spawnPoints.length);

    for (const s of def.spawns) {
      const count = Phaser.Math.Between(s.min, s.max);
      for (let i = 0; i < count; i++) {
        this.pendingSpawns.push({
          type: s.type, elite: s.elite ?? false, boss: false,
          laneIndex: laneIndices[this.pendingSpawns.length % laneIndices.length],
        });
      }
    }
    if (def.isBoss && def.bossType) {
      this.pendingSpawns.push({ type: def.bossType, elite: true, boss: true, bossName: def.name, laneIndex: laneIndices[0] });
    }

    Phaser.Utils.Array.Shuffle(this.pendingSpawns);
    this.aliveCount = this.pendingSpawns.length;
    if (this.pendingSpawns.length === 0) this.spawning = false;
    this.spawnTimer = 0;

    this.scene.events.emit('waveStart', {
      wave: this.wave,
      total: this.waves.length,
      isBoss: def.isBoss,
      name: def.name,
      hint: def.hint,
      lanes: laneIndices.map(index => this.chapter.spawnPoints[index]),
      primaryLane: this.chapter.spawnPoints[laneIndices[0]],
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
      while (this.spawnTimer >= this.spawnIntervalMs && this.pendingSpawns.length > 0) {
        if (this.enemies.countActive(true) >= MAX_ACTIVE_ENEMIES) {
          // Keep every authored encounter queued, without accumulating a burst
          // of overdue spawns while summons occupy the available space.
          this.spawnTimer = this.spawnIntervalMs;
          break;
        }
        this.spawnTimer -= this.spawnIntervalMs;
        const s = this.pendingSpawns.pop()!;
        this.spawnOne(s.type, s.elite, s.boss, s.bossName, s.laneIndex);
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

  private spawnOne(type: string, elite: boolean, boss: boolean, bossName?: string, laneIndex = 0): void {
    const cfg = ENEMY_TYPES[type];
    if (!cfg) return;

    // Endless mode: random chance to become elite
    const endlessEliteChance = this.endlessScale > 1.5 ? Math.min(0.5, (this.endlessScale - 1.5) * 0.15) : 0;
    const isElite = elite || (!boss && endlessEliteChance > 0 && Math.random() < endlessEliteChance);

    const pos = this.getSpawnPos(laneIndex);
    const enemy = new Enemy(this.scene, pos.x, pos.y, cfg, isElite, boss);
    const hpScale = this.chapter.enemyHpScale * this.endlessScale * (boss ? (this.waves[this.wave - 1] as StageWaveDef)?.bossHpScale ?? 1 : 1);
    const damageScale = this.chapter.enemyDamageScale * (1 + (this.endlessScale - 1) * 0.55);
    enemy.hp = Math.round(enemy.hp * hpScale);
    enemy.maxHp = enemy.hp;
    enemy.dmg = Math.round(enemy.dmg * damageScale);
    enemy.projectileDamageScale = damageScale;
    if (this.endlessScale > 1) {
      // Further stations grow in toughness, while telegraphs remain dodgeable.
      enemy.spd *= Math.min(1.65, 1 + (this.endlessScale - 1) * 0.2);
    }
    if (bossName) enemy.setData('bossName', bossName);
    if (type === 'slime' && (isElite || this.endlessScale > 1.2)) {
      enemy.canSplit = true;
    }
    this.enemies.add(enemy);
  }

  private getSpawnPos(laneIndex: number): { x: number; y: number } {
    const lane = this.chapter.spawnPoints[laneIndex] ?? this.chapter.spawnPoints[0];
    const edgeIsVertical = lane.x < 100 || lane.x > ARENA_WIDTH - 100;
    const x = Phaser.Math.Clamp(lane.x + (edgeIsVertical ? 0 : Phaser.Math.Between(-70, 70)), 30, ARENA_WIDTH - 30);
    const y = Phaser.Math.Clamp(lane.y + (edgeIsVertical ? Phaser.Math.Between(-70, 70) : 0), 30, ARENA_HEIGHT - 30);
    return { x, y };
  }
}
