import type { OperativeId } from './operatives';

/** Fixed, finite progression. All effects are applied at the beginning of a run. */
export interface CombatBonuses {
  damageMult: number;
  maxHpBonus: number;
  startCharge: number;
  speedMult: number;
  attackSpeedMult: number;
  dashCooldownMult: number;
  chargePerKillBonus: number;
  magnetRadiusBonus: number;
  shieldBonus: number;
  regenPerSec: number;
  coreHpBonus: number;
  critChanceBonus: number;
  explosiveBonus: number;
  ricochetBonus: number;
  piercing: boolean;
  homing: boolean;
}

export interface ResearchDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  requiredClears: number;
  bonuses: Partial<CombatBonuses>;
}

export interface SpecializationDef {
  id: string;
  operativeId: OperativeId;
  name: string;
  description: string;
  cost: number;
  requiredRank: number;
  bonuses: Partial<CombatBonuses>;
}

export const CAMPAIGN_STAGE_COUNT = 50;
export const MASTERY_XP_THRESHOLDS = [0, 12, 30, 60, 100, 150, 220] as const;
export const MASTERY_TITLES = ['初次同行', '渐入佳境', '默契旅伴', '熟门熟路', '拿手好戏', '营地专家', '暖影知己'] as const;
export const MAX_MASTERY_XP = MASTERY_XP_THRESHOLDS[MASTERY_XP_THRESHOLDS.length - 1];
export const MAX_STAGE_REPLAY_REWARDS = 3;

export const PROGRESSION_MILESTONES: { stageId: number; operativeId: OperativeId; skillId: string }[] = [
  { stageId: 3, operativeId: 'gunner', skillId: 'barrage' },
  { stageId: 8, operativeId: 'warden', skillId: 'timerift' },
  { stageId: 15, operativeId: 'engineer', skillId: 'sentry' },
];

export const RESEARCH_NODES: ResearchDef[] = [
  { id: 'tidy_satchel', name: '口袋整理术', description: '拾取范围 +30，更容易拾回旅途灵感。', cost: 6, requiredClears: 2, bonuses: { magnetRadiusBonus: 30 } },
  { id: 'camp_stakes', name: '结实小帐篷', description: '营地最大耐久 +35，为防守多留一点余地。', cost: 8, requiredClears: 5, bonuses: { coreHpBonus: 35 } },
  { id: 'inspiration_kitchen', name: '灵感小厨房', description: '每次击败敌人多获得 1 点技能灵感。', cost: 10, requiredClears: 10, bonuses: { chargePerKillBonus: 1 } },
  { id: 'soft_lining', name: '软绒护符', description: '每次出发携带 1 层护盾。', cost: 12, requiredClears: 18, bonuses: { shieldBonus: 1 } },
  { id: 'trail_shoes', name: '轻快旅行鞋', description: '移动速度 +4%，更从容地换线支援。', cost: 14, requiredClears: 28, bonuses: { speedMult: 1.04 } },
  { id: 'tea_garden', name: '午后茶园', description: '每秒回复 1 点生命，照顾长途旅行的体力。', cost: 18, requiredClears: 40, bonuses: { regenPerSec: 1 } },
];

export const SPECIALIZATIONS: SpecializationDef[] = [
  { id: 'ranger_roamer', operativeId: 'ranger', name: '追风漫游', description: '移动速度 +10%；伤害 −8%。适合穿梭与救场。', cost: 8, requiredRank: 2, bonuses: { speedMult: 1.1, damageMult: 0.92 } },
  { id: 'ranger_blossom', operativeId: 'ranger', name: '满园花火', description: '花火爆炸等级 +1；冲刺冷却 +15%。用站位换群体清理。', cost: 12, requiredRank: 4, bonuses: { explosiveBonus: 1, dashCooldownMult: 1.15 } },
  { id: 'ranger_focus', operativeId: 'ranger', name: '会心一笑', description: '暴击率 +12%；攻击速度 −10%。每一发更有分量。', cost: 16, requiredRank: 6, bonuses: { critChanceBonus: 0.12, attackSpeedMult: 0.9 } },
  { id: 'gunner_thread', operativeId: 'gunner', name: '穿针引线', description: '弹丸穿透敌人；伤害 −10%。引导敌人排队更划算。', cost: 8, requiredRank: 2, bonuses: { piercing: true, damageMult: 0.9 } },
  { id: 'gunner_popcorn', operativeId: 'gunner', name: '加一份爆米花', description: '攻击速度 +15%；移动速度 −10%。需要提前选好阵地。', cost: 12, requiredRank: 4, bonuses: { attackSpeedMult: 1.15, speedMult: 0.9 } },
  { id: 'gunner_stroll', operativeId: 'gunner', name: '边走边聊', description: '移动速度 +12%；攻击速度 −10%。擅长换线追赶。', cost: 16, requiredRank: 6, bonuses: { speedMult: 1.12, attackSpeedMult: 0.9 } },
  { id: 'warden_cushion', operativeId: 'warden', name: '抱枕堡垒', description: '开局护盾 +2；伤害 −8%。让守住营地更安心。', cost: 8, requiredRank: 2, bonuses: { shieldBonus: 2, damageMult: 0.92 } },
  { id: 'warden_tea', operativeId: 'warden', name: '慢慢喝口茶', description: '每秒回复 2 点生命；攻击速度 −10%。适合持久守护。', cost: 12, requiredRank: 4, bonuses: { regenPerSec: 2, attackSpeedMult: 0.9 } },
  { id: 'warden_rescue', operativeId: 'warden', name: '及时小雨伞', description: '冲刺冷却 −18%；最大生命 −15。更快赶到需要你的地方。', cost: 16, requiredRank: 6, bonuses: { dashCooldownMult: 0.82, maxHpBonus: -15 } },
  { id: 'engineer_bounce', operativeId: 'engineer', name: '回声弹珠', description: '弹射等级 +1；伤害 −10%。借掩体角度组织火力。', cost: 8, requiredRank: 2, bonuses: { ricochetBonus: 1, damageMult: 0.9 } },
  { id: 'engineer_ideas', operativeId: 'engineer', name: '灵感叮咚', description: '击败敌人多获 2 点灵感；攻击速度 −8%。让小帮手更常出场。', cost: 12, requiredRank: 4, bonuses: { chargePerKillBonus: 2, attackSpeedMult: 0.92 } },
  { id: 'engineer_nest', operativeId: 'engineer', name: '小小维修窝', description: '护盾 +1、每秒回复 1 生命；移动速度 −8%。适合守住阵地。', cost: 16, requiredRank: 6, bonuses: { shieldBonus: 1, regenPerSec: 1, speedMult: 0.92 } },
];

export function createBaseCombatBonuses(): CombatBonuses {
  return {
    damageMult: 1, maxHpBonus: 0, startCharge: 0, speedMult: 1, attackSpeedMult: 1,
    dashCooldownMult: 1, chargePerKillBonus: 0, magnetRadiusBonus: 0, shieldBonus: 0,
    regenPerSec: 0, coreHpBonus: 0, critChanceBonus: 0, explosiveBonus: 0,
    ricochetBonus: 0, piercing: false, homing: false,
  };
}
