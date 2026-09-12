import Phaser from 'phaser';
import { Hero } from '../entities/Hero';
import { BuildPath, UpgradeDef, WAVE_UPGRADES, LEVEL_UPGRADES } from '../data/upgrades';
import { getSkill } from '../data/skills';
import { getOperative, OperativeId } from '../data/operatives';

export class UpgradeManager {
  private stacks = new Map<string, number>();
  private appliedIds: string[] = [];
  private buildPath: BuildPath | null = null;
  private pathUpgradeCount = 0;
  private evolved = false;
  private pendingEvolution: BuildPath | null = null;
  private availableSkills: Set<string>;

  constructor(availableSkills: string[] = ['burst']) {
    this.availableSkills = new Set(['burst', ...availableSkills]);
  }

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

  initializeOperative(hero: Hero, operativeId: OperativeId): void {
    const operative = getOperative(operativeId);
    this.buildPath = operative.path;
    hero.unlockedSkills = [];
    hero.skillLevels = {};
    this.unlockSkill(hero, operative.signatureSkill);
    hero.activeSkillId = operative.signatureSkill;

    switch (operative.id) {
      case 'ranger':
        hero.critChance += 0.08;
        hero.dashCooldown = Math.round(hero.dashCooldown * 0.85);
        hero.explosiveShot = 1;
        break;
      case 'gunner':
        hero.bulletCount = 2;
        hero.atkSpdMult += 0.1;
        hero.speedMult *= 0.92;
        break;
      case 'warden':
        hero.maxHp += 35;
        hero.hp += 35;
        hero.shieldStacks = 2;
        hero.atkSpdMult *= 0.92;
        break;
      case 'engineer':
        hero.bulletHoming = true;
        hero.ricochetShot = 1;
        hero.damageMult *= 0.92;
        break;
    }
  }

  pickThree(pool: 'wave' | 'level', hero?: Hero, defenseRatio = 1): UpgradeDef[] {
    const source = pool === 'wave' ? WAVE_UPGRADES : LEVEL_UPGRADES;
    const available = source.filter(upgrade => {
      if (upgrade.path && upgrade.path !== this.buildPath) return false;
      if (this.getStacks(upgrade.id) >= upgrade.maxStacks) return false;
      if (hero && upgrade.id === 'heal' && hero.hp >= hero.maxHp * 0.92 && defenseRatio >= 0.92) return false;
      if (upgrade.unlocksSkill) {
        if (!this.availableSkills.has(upgrade.unlocksSkill)) return false;
        if (hero?.unlockedSkills.includes(upgrade.unlocksSkill)) return false;
      }
      if (upgrade.requiresSkill && hero) {
        if (!hero.unlockedSkills.includes(upgrade.requiresSkill)) return false;
        if ((hero.skillLevels[upgrade.requiresSkill] || 1) >= (getSkill(upgrade.requiresSkill)?.maxLevel ?? 5)) return false;
      }
      return true;
    });

    if (pool === 'level') return Phaser.Utils.Array.Shuffle(available).slice(0, 3);

    const pathChoices = Phaser.Utils.Array.Shuffle(available.filter(upgrade => upgrade.path === this.buildPath));
    const skillChoices = Phaser.Utils.Array.Shuffle(available.filter(upgrade => upgrade.unlocksSkill || upgrade.requiresSkill));
    const utilityChoices = Phaser.Utils.Array.Shuffle(available.filter(upgrade => !upgrade.path && !upgrade.unlocksSkill && !upgrade.requiresSkill));
    const result: UpgradeDef[] = [];

    const addFirstUnique = (choices: UpgradeDef[]): void => {
      const choice = choices.find(item => !result.some(picked => picked.id === item.id));
      if (choice) result.push(choice);
    };
    addFirstUnique(pathChoices);
    addFirstUnique(utilityChoices);
    addFirstUnique(skillChoices);
    // A signature skill is both a path card and a skill card. Never offer it
    // twice, and fill all three slots even when one of the pools is exhausted.
    const fallback = Phaser.Utils.Array.Shuffle([...available]);
    while (result.length < Math.min(3, available.length)) addFirstUnique(fallback);

    return Phaser.Utils.Array.Shuffle(result).slice(0, 3);
  }

  applyById(hero: Hero, id: string): void {
    const upgrade = [...WAVE_UPGRADES, ...LEVEL_UPGRADES].find(item => item.id === id);
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
      case 'atk_up': hero.damageMult += 0.15; break;
      case 'atkspd_up': hero.atkSpdMult += 0.13; break;
      case 'hp_up': hero.maxHp += 22; hero.heal(22); break;
      case 'heal':
        hero.heal(Math.round(hero.maxHp * 0.3));
        hero.scene.events.emit('defenseRepair', { ratio: 0.3 });
        break;
      case 'spd_up': hero.speedMult += 0.1; break;
      case 'charge_up': hero.chargePerKill += 4; break;

      case 'crit': hero.critChance = Math.min(0.6, hero.critChance + 0.12); break;
      case 'explosive': hero.explosiveShot += 1; break;
      case 'skill_burst_up': this.raiseSkill(hero, 'burst'); hero.damageMult += 0.05; break;

      case 'scatter': hero.bulletCount += 1; hero.damageMult *= 0.94; hero.spreadAngle = Math.max(0.12, hero.spreadAngle - 0.025); break;
      case 'pierce': hero.bulletPiercing = true; hero.pierceRetain = Math.min(0.9, hero.pierceRetain + 0.1); break;
      case 'skill_barrage_up': this.raiseSkill(hero, 'barrage'); hero.atkSpdMult += 0.06; break;

      case 'frost_shot': hero.frostShot += 1; break;
      case 'shield': hero.shieldStacks += 1; break;
      case 'dash_cd': hero.dashCooldown = Math.max(450, Math.round(hero.dashCooldown * 0.85)); break;
      case 'skill_timerift_up': this.raiseSkill(hero, 'timerift'); hero.shieldStacks += 1; break;

      case 'homing': hero.bulletHoming = true; hero.damageMult += 0.06; break;
      case 'ricochet': hero.ricochetShot += 1; break;
      case 'skill_sentry_up': this.raiseSkill(hero, 'sentry'); hero.chargePerKill += 2; break;

      case 'unlock_barrage': this.unlockSkill(hero, 'barrage'); break;
      case 'unlock_timerift': this.unlockSkill(hero, 'timerift'); break;
      case 'unlock_sentry': this.unlockSkill(hero, 'sentry'); break;
      case 'support_barrage_up': this.raiseSkill(hero, 'barrage'); break;
      case 'support_timerift_up': this.raiseSkill(hero, 'timerift'); break;
      case 'support_sentry_up': this.raiseSkill(hero, 'sentry'); break;

      case 'veteran_damage': hero.damageMult += 0.2; hero.critChance = Math.min(0.6, hero.critChance + 0.05); break;
      case 'veteran_armor': hero.maxHp += 30; hero.heal(30); hero.shieldStacks += 1; break;
      case 'veteran_speed': hero.speedMult += 0.12; hero.dashCooldown = Math.max(450, Math.round(hero.dashCooldown * 0.88)); break;
      case 'veteran_energy': hero.chargePerKill += 4; hero.charge = hero.chargeMax; break;
      case 'veteran_multishot': hero.bulletCount += 1; hero.damageMult *= 0.95; break;
      case 'veteran_repair': hero.heal(hero.maxHp); hero.regenPerSec += 1; break;
    }

    if (upgrade.path && upgrade.path === this.buildPath) {
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
      case 'engineer':
        hero.bulletHoming = true;
        hero.ricochetShot += 2;
        this.raiseSkill(hero, 'sentry');
        break;
    }
  }
}
