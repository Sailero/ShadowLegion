import Phaser from 'phaser';
import { Hero } from '../entities/Hero';
import { UpgradeDef, WAVE_UPGRADES, LEVEL_UPGRADES } from '../data/upgrades';

export class UpgradeManager {
  private stacks = new Map<string, number>();
  private appliedIds: string[] = [];

  pickThree(pool: 'wave' | 'level'): UpgradeDef[] {
    const source = pool === 'wave' ? WAVE_UPGRADES : LEVEL_UPGRADES;
    const available = source.filter(u => {
      const cur = this.stacks.get(u.id) || 0;
      return cur < u.maxStacks;
    });

    const result: UpgradeDef[] = [];
    const copy = [...available];
    while (result.length < 3 && copy.length > 0) {
      const idx = Phaser.Math.Between(0, copy.length - 1);
      result.push(copy.splice(idx, 1)[0]);
    }

    if (result.length < 3) {
      const fill = source.filter(u => !result.find(r => r.id === u.id));
      while (result.length < 3 && fill.length > 0) {
        result.push(fill.splice(Phaser.Math.Between(0, fill.length - 1), 1)[0]);
      }
    }

    return result;
  }

  getAppliedIds(): string[] { return [...this.appliedIds]; }

  applyById(hero: Hero, id: string): void {
    const upg = [...WAVE_UPGRADES, ...LEVEL_UPGRADES].find(u => u.id === id);
    if (upg) this.apply(hero, upg);
  }

  apply(hero: Hero, upgrade: UpgradeDef): void {
    this.appliedIds.push(upgrade.id);
    const cur = (this.stacks.get(upgrade.id) || 0) + 1;
    this.stacks.set(upgrade.id, cur);

    switch (upgrade.id) {
      case 'atk_up':       hero.damageMult *= 1.15; break;
      case 'atkspd_up':    hero.atkSpdMult *= 1.2; break;
      case 'bulletspd_up': hero.bulletSpeed *= 1.25; break;
      case 'scatter':      hero.bulletCount = 3; break;
      case 'pierce':       hero.bulletPiercing = true; break;
      case 'homing':       hero.bulletHoming = true; break;
      case 'hp_up':        hero.maxHp += 25; hero.hp = Math.min(hero.hp + 25, hero.maxHp); break;
      case 'heal':         hero.heal(Math.round(hero.maxHp * 0.3)); break;
      case 'shield':       hero.hasShield = true; break;
      case 'spd_up':       hero.speedMult *= 1.12; break;
      case 'dash_cd':      hero.dashCooldown *= 0.7; break;
      case 'dash_dmg':     hero.dashDamage = hero.bulletDamage * hero.damageMult * 2; break;
      case 'magnet':       hero.magnetRadius *= 1.5; break;
      case 'charge_up':    hero.chargePerKill = Math.round(hero.chargePerKill * 1.5); break;
      case 'blast_up':
        hero.chargeBlastRadius = Math.round(hero.chargeBlastRadius * 1.3);
        hero.chargeBlastDamage = Math.round(hero.chargeBlastDamage * 1.3);
        break;
      case 'perm_atk':     hero.bulletDamage += 5; break;
      case 'perm_hp':      hero.maxHp += 20; hero.hp = Math.min(hero.hp + 20, hero.maxHp); break;
      case 'perm_spd':     hero.speedMult *= 1.08; break;
      case 'perm_charge':  hero.chargeBlastDamage += 20; break;
    }
  }

  reset(): void {
    this.stacks.clear();
    this.appliedIds = [];
  }
}
