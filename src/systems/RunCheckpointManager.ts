import { OPERATIVES, type OperativeId } from '../data/operatives';
import { MAX_ENDLESS_LEVEL, WAVE_CFG } from '../config/gameConfig';
import { LEVEL_UPGRADES, WAVE_UPGRADES } from '../data/upgrades';
import type { GameMode } from '../data/modes';
import {
  MAX_RECORDED_RUN_MS, sanitizeRunRecorderSnapshot, type RunRecorderSnapshot,
} from './RunRecorder';

export interface RunCheckpointInput {
  level: number;
  startLevel?: number;
  operativeId: OperativeId;
  endless: boolean;
  score: number;
  kills: number;
  elapsedMs: number;
  appliedUpgrades: string[];
  shadowTrial: boolean;
  recorder: RunRecorderSnapshot;
  mode?: GameMode;
  stageId?: number;
  trialTier?: number;
}

export interface RunCheckpoint extends RunCheckpointInput {
  version: 1;
  savedAt: string;
  startLevel: number;
}

const STORAGE_KEY = 'shadowlegion_checkpoint_v1';
const MAX_CHECKPOINT_BYTES = 65536;
const ALL_UPGRADES = [...WAVE_UPGRADES, ...LEVEL_UPGRADES];
const MAX_UPGRADE_COUNT = ALL_UPGRADES.reduce((total, item) => total + item.maxStacks, 0);

const finiteWithin = (value: unknown, min: number, max: number, integer = false): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));

/** A checkpoint replays a chapter's opening build, never mid-wave physics. */
export function sanitizeRunCheckpoint(value: unknown): RunCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || typeof source.endless !== 'boolean' || typeof source.shadowTrial !== 'boolean') return null;
  if (!finiteWithin(source.level, 1, source.endless ? MAX_ENDLESS_LEVEL : WAVE_CFG.levels, true)) return null;
  if (source.mode !== undefined && !['campaign', 'endless', 'shadow'].includes(source.mode as string)) return null;
  if (source.stageId !== undefined && !finiteWithin(source.stageId, 1, 50, true)) return null;
  if (source.trialTier !== undefined && !finiteWithin(source.trialTier, 1, 5, true)) return null;
  if (source.mode === 'campaign' && source.stageId !== undefined && Math.ceil((source.stageId as number) / 10) !== source.level) return null;
  if (source.mode && (source.mode === 'endless') !== source.endless) return null;
  const startLevel = source.startLevel === undefined ? 1 : source.startLevel;
  if (!finiteWithin(startLevel, 1, source.level, true)) return null;
  if (!OPERATIVES.some(item => item.id === source.operativeId)) return null;
  if (!finiteWithin(source.score, 0, 1000000000, true) || !finiteWithin(source.kills, 0, 1000000000, true)) return null;
  if (!finiteWithin(source.elapsedMs, 0, MAX_RECORDED_RUN_MS)) return null;
  if (typeof source.savedAt !== 'string' || source.savedAt.length > 40 || !Number.isFinite(Date.parse(source.savedAt))) return null;
  if (!Array.isArray(source.appliedUpgrades) || source.appliedUpgrades.length > MAX_UPGRADE_COUNT) return null;
  const appliedUpgrades: string[] = [];
  const stacks = new Map<string, number>();
  const operative = OPERATIVES.find(item => item.id === source.operativeId)!;
  const path = operative.path;
  const skills = new Set([operative.signatureSkill]);
  for (const value of source.appliedUpgrades) {
    if (typeof value !== 'string' || value.length > 64) return null;
    const upgrade = ALL_UPGRADES.find(item => item.id === value);
    if (!upgrade || (upgrade.path && upgrade.path !== path)) return null;
    if (upgrade.requiresSkill && !skills.has(upgrade.requiresSkill)) return null;
    if (upgrade.unlocksSkill) skills.add(upgrade.unlocksSkill);
    const count = (stacks.get(value) || 0) + 1;
    if (count > upgrade.maxStacks) return null;
    stacks.set(value, count);
    appliedUpgrades.push(value);
  }
  if (!source.recorder || typeof source.recorder !== 'object' || (source.recorder as { version?: unknown }).version !== 1) return null;
  return {
    version: 1, savedAt: source.savedAt,
    level: source.level, startLevel, operativeId: source.operativeId as OperativeId, endless: source.endless,
    score: source.score, kills: source.kills, elapsedMs: source.elapsedMs,
    appliedUpgrades, shadowTrial: source.shadowTrial,
    recorder: sanitizeRunRecorderSnapshot(source.recorder),
    mode: source.mode as GameMode | undefined, stageId: source.stageId as number | undefined, trialTier: source.trialTier as number | undefined,
  };
}

export class RunCheckpointManager {
  static load(): RunCheckpoint | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw.length > MAX_CHECKPOINT_BYTES) return null;
      return sanitizeRunCheckpoint(JSON.parse(raw) as unknown);
    } catch { return null; }
  }

  static save(input: RunCheckpointInput): boolean {
    const checkpoint = sanitizeRunCheckpoint({ ...input, version: 1, savedAt: new Date().toISOString() });
    if (!checkpoint) return false;
    try {
      const serialized = JSON.stringify(checkpoint);
      if (serialized.length > MAX_CHECKPOINT_BYTES) return false;
      localStorage.setItem(STORAGE_KEY, serialized);
      return true;
    } catch { return false; }
  }

  static clear(): boolean {
    try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
  }
}
