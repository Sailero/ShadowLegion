import Phaser from 'phaser';
import { Hero } from '../entities/Hero';
import {
  BuildPath, UpgradeDef, WAVE_UPGRADES, LEVEL_UPGRADES,
} from '../data/upgrades';
import { getSkill } from '../data/skills';

export class UpgradeManager {
  private stacks = new Map<string, number>();
  private appliedIds: string[] = [];
  private buildPath: BuildPath | null = null;
  private pathUpgradeCount = 0;
  private evolved = false;
  private pendingEvolution: BuildPath | null = null;

  getStacks(id: string): number { return this.stacks.get(id) || 0; }
  getBuildPath(): BuildPath | null { return this.buildPath; }
  getAppliedIds(): string[] { return [...this.appliedIds]; }
  getPathUpgradeCount(): number { return this.pathUpgradeCount; }
  isEvolved(): boolean { return this.evolved; }
  consumeEvolution(): BuildPath | null {
    const path = this.pendingEvolution;
    this.pendingEvolution = null;
    return path;
  }

  pickThree(pool: 'wave' | 'level', hero?: Hero): UpgradeDef[] {
    const source = pool === 'wave' ? WAVE_UPGRADES : LEVEL_UPGRADES;

    if (pool === 'wave' && !this.buildPath) {
      return Phaser.Utils.Array.Shuffle(source.filter(u => u.isCore)).slice(0, 3);
    }

    const available = source.filter(u => {
      if (u.isCore) return false;
      if (u.path && u.path !== this.buildPath) return false;
      if (this.getStacks(u.id) >= u.maxStacks) return false;
      if (hero && u.id === 'heal' && hero.hp >= hero.maxHp * 0.92) return false;
      return true;
    });

    const pathChoices = Phaser.Utils.Array.Shuffle(available.filter(u => u.path === this.buildPath));
    const utilityChoices = Phaser.Utils.Array.Shuffle(available.filter(u => !u.path));
    const result: UpgradeDef[] = [];

    // Two identity-building cards and one universal card keeps choices legible.
    if (pathChoices.length) result.push(pathChoices.shift()!);
    if (utilityChoices.length) result.push(utilityChoices.shift()!);
    if (pathChoices.length) result.push(pathChoices.shift()!);
    else if (utilityChoices.length) result.push(utilityChoices.shift()!);

    return Phaser.Utils.Array.Shuffle(result).slice(0, 3);
  }

  applyById(hero: Hero, id: string): void {
    const upgrade = [...WAVE_UPGRADES, ...LEVEL_UPGRADES].find(u => u.id === id);
    if (upgrade) {
      this.apply(hero, upgrade);
      this.pendingEvolution = null;
    }
  }

  apply(hero: Hero, upgrade: UpgradeDef): void {
    const current = this.getStacks(upgrade.id);
    if (current >= upgrade.maxStacks) return;

    this.appliedIds.push(upgrade.id);
    this.stacks.set(upgrade.id, current + 1);

    switch (upgrade.id) {
      case 'core_nova':
        this.buildPath = 'nova';
        hero.explosiveShot = 1;
        hero.skillLevels.burst = 2;
        hero.damageMult += 0.05;
        break;
      case 'core_storm':
        this.buildPath = 'storm';
        hero.bulletCount = 2;
        hero.atkSpdMult += 0.05;
        this.unlockSkill(hero, 'barrage');
        break;
      case 'core_rift':
        this.buildPath = 'rift';
        hero.shieldStacks += 1;
        hero.dodgeChance = Math.min(0.45, hero.dodgeChance + 0.03);
        this.unlockSkill(hero, 'timerift');
        break;

      case 'atk_up': hero.damageMult += 0.18; break;
      case 'atkspd_up': hero.atkSpdMult += 0.16; break;
      case 'hp_up': hero.maxHp += 25; hero.heal(25); break;
      case 'heal': hero.heal(Math.round(hero.maxHp * 0.35)); break;
      case 'spd_up': hero.speedMult += 0.12; break;
      case 'charge_up': hero.chargePerKill += 5; break;

      case 'crit': hero.critChance = Math.min(0.6, hero.critChance + 0.14); break;
      case 'explosive': hero.explosiveShot += 1; break;
      case 'skill_burst_up':
        this.raiseSkill(hero, 'burst');
        hero.critChance = Math.min(0.6, hero.critChance + 0.05);
        break;

      case 'scatter':
        hero.bulletCount += 1;
        hero.spreadAngle = Math.max(0.12, hero.spreadAngle - 0.025);
        break;
      case 'pierce':
        hero.bulletPiercing = true;
        hero.pierceRetain = Math.min(0.9, hero.pierceRetain + 0.1);
        break;
      case 'skill_barrage_up':
        this.raiseSkill(hero, 'barrage');
        hero.atkSpdMult += 0.08;
        break;

      case 'frost_shot': hero.frostShot += 1; break;
      case 'shield': hero.shieldStacks += 1; break;
      case 'dash_cd': hero.dashCooldown = Math.max(450, Math.round(hero.dashCooldown * 0.82)); break;
      case 'skill_timerift_up':
        this.raiseSkill(hero, 'timerift');
        hero.shieldStacks += 1;
        break;
    }

    if (!upgrade.isCore && upgrade.path && upgrade.path === this.buildPath) {
      this.pathUpgradeCount++;
      if (!this.evolved && this.pathUpgradeCount >= 3) this.evolve(hero, upgrade.path);
    }
  }

  reset(): void {
    this.stacks.clear();
    this.appliedIds = [];
    this.buildPath = null;
    this.pathUpgradeCount = 0;
    this.evolved = false;
    this.pendingEvolution = null;
  }

  private unlockSkill(hero: Hero, id: string): void {
    if (!hero.unlockedSkills.includes(id)) hero.unlockedSkills.push(id);
    hero.skillLevels[id] = Math.max(1, hero.skillLevels[id] || 0);
    hero.activeSkillId = id;
  }

  private raiseSkill(hero: Hero, id: string): void {
    const max = getSkill(id)?.maxLevel ?? 3;
    hero.skillLevels[id] = Math.min(max, Math.max(1, hero.skillLevels[id] || 1) + 1);
  }

  private evolve(hero: Hero, path: BuildPath): void {
    this.evolved = true;
    this.pendingEvolution = path;
    switch (path) {
      case 'nova':
        hero.explosiveShot += 1;
        hero.critChance = Math.min(0.65, hero.critChance + 0.1);
        hero.damageMult += 0.08;
        break;
      case 'storm':
        hero.bulletCount += 1;
        hero.bulletPiercing = true;
        hero.atkSpdMult += 0.12;
        break;
      case 'rift':
        hero.shieldStacks += 2;
        hero.frostShot += 1;
        hero.dashCooldown = Math.max(450, Math.round(hero.dashCooldown * 0.8));
        break;
    }
  }
}
