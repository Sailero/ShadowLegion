import { MetaProgressionManager, type MetaState } from './MetaProgressionManager';
import { sanitizeCampaignState } from './CampaignProgressionManager';
import { sanitizeRunCheckpoint } from './RunCheckpointManager';
import { OPERATIVES } from '../data/operatives';
import { MAX_ENDLESS_LEVEL, MAX_ENDLESS_WAVE } from '../config/gameConfig';
import { POSTAL_JOURNEY_STORAGE_KEY, sanitizePostalJourney } from './PostalJourneyManager';
import { JOURNEY_STORAGE_KEY, MAX_JOURNEY_BYTES, sanitizeJourneyState } from './JourneyProgressManager';
import { deriveLakeCheckpoint, deriveMountainCheckpoint, JOURNEY_REGION_IDS, JOURNEY_VERSION,
  type JourneyRegionId, type LakeCheckpoint, type MountainCheckpoint } from '../data/journey';

export const SAVE_BACKUP_FORMAT = 'sunlit-echoes-journey-backup';
export const SAVE_BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 1024 * 1024;
export const BACKUP_KEYS = {
  meta: 'shadowlegion_meta_v1',
  campaign: 'shadowlegion_campaign_v1',
  checkpoint: 'shadowlegion_checkpoint_v1',
  settings: 'sunlit_echoes_settings_v1',
  scores: 'shadowlegion_scores',
  shadowTrials: 'sunlit_shadow_trials_v1',
  tutorial: 'shadowlegion_tutorial_v4',
  waveSamples: 'sunlit_echoes_wave_metrics_v1',
  postal: POSTAL_JOURNEY_STORAGE_KEY,
  journey: JOURNEY_STORAGE_KEY,
} as const;
export type BackupSection = keyof typeof BACKUP_KEYS;
export interface BackupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface BackupPreview {
  createdAt: string;
  clearedStages: number;
  stars: number;
  shadowCores: number;
  operativeCount: number;
  hasCheckpoint: boolean;
  postal: { delivered: boolean; addressPieces: number } | null;
  journey: { deliveredRegions: JourneyRegionId[]; lakeCheckpoint: LakeCheckpoint; mountainCheckpoint: MountainCheckpoint; optionalCount: number } | null;
  included: string[];
  preserved: string[];
  cleared: string[];
  routeRebuilt: boolean;
}
export type BackupFailure = { ok: false; code: string; message: string };
export type BackupPreviewResult = { ok: true; preview: BackupPreview } | BackupFailure;
export type BackupExportResult = { ok: true; text: string; filename: string; preview: BackupPreview } | BackupFailure;
export type BackupRestoreResult = { ok: true; message: string } | (BackupFailure & { rollback: 'complete' | 'incomplete' | 'not-needed' });

const SECTIONS = Object.keys(BACKUP_KEYS) as BackupSection[];
const NAMES: Record<BackupSection, string> = {
  meta: '暖晶与伙伴成长', campaign: '路线与星章', checkpoint: '起点续玩', settings: '声音与操作设置',
  scores: '本机成绩', shadowTrials: '影子切磋纪录', tutorial: '初次旅行教学', waveSamples: '试玩用时记录',
  postal: '森林邮路与回信',
  journey: '主旅程与地区进度',
};
const LIMITS: Record<BackupSection, number> = {
  meta: 512 * 1024, campaign: 100000, checkpoint: 65536, settings: 2048,
  scores: 16384, shadowTrials: 8192, tutorial: 100, waveSamples: 150000,
  postal: 4096,
  journey: MAX_JOURNEY_BYTES,
};
const VERSIONED: Partial<Record<BackupSection, number>> = { meta: 3, campaign: 1, checkpoint: 1, settings: 1, postal: 1, journey: JOURNEY_VERSION };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const finite = (value: unknown, min: number, max: number, integer = false): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
const bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
const has = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const fail = (code: string, message: string): BackupFailure => ({ ok: false, code, message });
const validOperative = (value: unknown): boolean => OPERATIVES.some(item => item.id === value);

function sanitizeScores(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isObject).filter(item => finite(item.score, 0, 1e9) && finite(item.kills, 0, 1e9) &&
    finite(item.level, 1, MAX_ENDLESS_LEVEL, true) && finite(item.wave, 0, MAX_ENDLESS_WAVE, true) && isDate(item.date) && typeof item.endless === 'boolean' &&
    (item.durationSec === undefined || finite(item.durationSec, 0, 604800)) &&
    (item.build === undefined || item.build === null || ['nova', 'storm', 'rift', 'engineer'].includes(item.build as string)))
    .sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 10).map(item => ({
      score: item.score, kills: item.kills, level: item.level, wave: item.wave, date: item.date, endless: item.endless,
      ...(item.durationSec !== undefined ? { durationSec: item.durationSec } : {}),
      ...(item.build !== undefined ? { build: item.build } : {}),
    }));
}
function sanitizeShadowTrials(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return [1, 2, 3, 4, 5].flatMap(tier => {
    const item = value.find(entry => isObject(entry) && entry.tier === tier);
    const completionIds = isObject(item) && Array.isArray(item.completionIds)
      ? [...new Set(item.completionIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(id)).reverse())].slice(0, 8).reverse() : [];
    return isObject(item) && finite(item.wins, 1, 1e9, true) && finite(item.bestTimeSec, Number.MIN_VALUE, 604800)
      ? [{ tier, wins: Math.min(1000000, item.wins), bestTimeSec: Math.min(86400, item.bestTimeSec),
        ...(completionIds.length ? { completionIds } : {}) }] : [];
  });
}
function sanitizeWaveSamples(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isObject).filter(item => finite(item.chapter, 1, 10000, true) && finite(item.wave, 1, 5, true) &&
    finite(item.activeMs, Number.MIN_VALUE, 86400000) && validOperative(item.operativeId) && typeof item.shadowTrial === 'boolean' &&
    finite(item.coreRatio, 0, 1) && isDate(item.recordedAt)).slice(-120).map(item => ({
      chapter: item.chapter, wave: item.wave, activeMs: Math.max(1, Math.round(item.activeMs as number)),
      operativeId: item.operativeId, shadowTrial: item.shadowTrial, coreRatio: item.coreRatio, recordedAt: item.recordedAt,
    }));
}
function versionError(section: BackupSection, value: unknown): BackupFailure | null {
  if (section === 'meta' && isObject(value) && isObject(value.modeProgress)) {
    const ledger = value.modeProgress.shadowRewardLedger;
    if (isObject(ledger) && ledger.version !== 1) {
      return fail('unsupported-domain-version', '影子奖励记录使用了当前游戏不能读取的格式，请使用对应版本的游戏。');
    }
  }
  if (!isObject(value) || value.version === undefined) return null;
  const current = VERSIONED[section];
  if (current === undefined || !Number.isInteger(value.version) || (value.version as number) < 1 || (value.version as number) > current) {
    return fail('unsupported-domain-version', `${NAMES[section]}使用了当前游戏不能读取的格式，请使用对应版本的游戏。`);
  }
  return null;
}

interface PreparedBackup { ok: true; preview: BackupPreview; writes: Partial<Record<BackupSection, string | null>>; data: Record<string, unknown> }
function prepare(text: string): PreparedBackup | BackupFailure {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES || bytes(text) > MAX_BACKUP_BYTES) return fail('too-large', '备份不能超过 1 MB，请选择本游戏导出的旅途备份。');
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return fail('invalid-json', '这份文件不是完整的 JSON 备份，请重新选择。'); }
  if (!isObject(parsed) || parsed.format !== SAVE_BACKUP_FORMAT) return fail('wrong-format', '这不是暖影同行的旅途备份。');
  if (parsed.version !== SAVE_BACKUP_VERSION) return fail('unsupported-version', '这份备份的格式版本尚不支持，请使用对应版本的游戏。');
  if (!isDate(parsed.createdAt) || !isObject(parsed.data)) return fail('invalid-envelope', '备份的日期或内容不完整，尚未修改本机旅途。');
  const source = parsed.data;
  if (Object.keys(source).some(key => !SECTIONS.includes(key as BackupSection))) return fail('unknown-section', '备份包含无法识别的数据项目，尚未修改本机旅途。');
  if (!has(source, 'meta')) return fail('missing-progress', '备份缺少伙伴成长记录，无法确认完整旅途；本机数据未改变。');
  for (const section of SECTIONS) {
    if (!has(source, section) || source[section] === null) continue;
    if (bytes(JSON.stringify(source[section])) > LIMITS[section]) return fail('section-too-large', `${NAMES[section]}内容过大，无法安全恢复。`);
    const problem = versionError(section, source[section]);
    if (problem) return problem;
  }
  if (source.meta !== null && !isObject(source.meta)) return fail('invalid-meta', '伙伴成长记录损坏，尚未修改本机旅途。');
  if (isObject(source.meta) && !has(source.meta, 'modules') && !has(source.meta, 'shadowCores')) return fail('invalid-meta', '伙伴成长记录缺少必要内容，尚未修改本机旅途。');
  const meta: MetaState = MetaProgressionManager.sanitize(source.meta);
  const writes: PreparedBackup['writes'] = { meta: source.meta === null ? null : JSON.stringify(meta) };
  const data: Record<string, unknown> = { meta: source.meta === null ? null : meta };
  const included: string[] = [NAMES.meta];
  const preserved: string[] = [];
  const cleared: string[] = source.meta === null ? [NAMES.meta] : [];
  const routeRebuilt = !has(source, 'campaign');
  if (source.campaign !== undefined && source.campaign !== null && (!isObject(source.campaign) || source.campaign.version !== 1)) return fail('invalid-campaign', '路线记录损坏，尚未修改本机旅途。');
  const campaign = sanitizeCampaignState(source.campaign, meta);
  writes.campaign = source.campaign === null ? null : JSON.stringify(campaign);
  if (source.campaign === null) cleared.push('路线详细成绩（路线访问按成长重建）');
  data.campaign = source.campaign === null ? null : campaign;
  included.push(NAMES.campaign);

  for (const section of SECTIONS.filter(id => id !== 'meta' && id !== 'campaign')) {
    if (!has(source, section)) { preserved.push(NAMES[section]); continue; }
    included.push(NAMES[section]);
    const value = source[section];
    if (value === null) { writes[section] = null; data[section] = null; cleared.push(NAMES[section]); continue; }
    let clean: unknown = null;
    if (section === 'checkpoint') clean = sanitizeRunCheckpoint(value);
    else if (section === 'settings' && isObject(value)) clean = {
      volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : 0.3,
      reducedMotion: value.reducedMotion === true, autoFire: value.autoFire === true,
    };
    else if (section === 'scores') clean = sanitizeScores(value);
    else if (section === 'shadowTrials') clean = sanitizeShadowTrials(value);
    else if (section === 'waveSamples') clean = sanitizeWaveSamples(value);
    else if (section === 'postal') clean = sanitizePostalJourney(value);
    else if (section === 'journey') clean = sanitizeJourneyState(value);
    else if (section === 'tutorial' && value === 'done') clean = 'done';
    if (clean === null) return fail(`invalid-${section}`, `${NAMES[section]}记录损坏，尚未修改本机旅途。`);
    data[section] = clean;
    writes[section] = section === 'tutorial' ? clean as string : JSON.stringify(clean);
  }
  return { ok: true, writes, data, preview: {
    createdAt: parsed.createdAt, clearedStages: Object.values(campaign.stageResults).filter(record => record.stars > 0).length,
    stars: campaign.totalStars, shadowCores: meta.shadowCores, operativeCount: meta.unlockedOperatives.length,
    hasCheckpoint: Boolean(data.checkpoint), included, preserved, cleared, routeRebuilt,
    postal: data.postal ? (() => { const route = sanitizePostalJourney(data.postal)!; return { delivered: route.deliveryCompleted, addressPieces: route.foundAddressIds.length }; })() : null,
    journey: data.journey ? (() => { const route = sanitizeJourneyState(data.journey)!; return {
      deliveredRegions: JOURNEY_REGION_IDS.filter(id => route.deliveries[id]),
      lakeCheckpoint: deriveLakeCheckpoint(route), mountainCheckpoint: deriveMountainCheckpoint(route), optionalCount: route.optionalDiscoveries.length,
    }; })() : null,
  } };
}

/** No enumeration, network, engine state or cache mutation: only the listed game-owned keys. */
export class SaveBackupManager {
  static previewBackup(text: string): BackupPreviewResult {
    const prepared = prepare(text);
    return prepared.ok ? { ok: true, preview: prepared.preview } : prepared;
  }

  static exportBackup(storage?: BackupStorage): BackupExportResult {
    try {
      const store = storage ?? localStorage;
      const data: Record<string, unknown> = {};
      for (const section of SECTIONS) {
        const raw = store.getItem(BACKUP_KEYS[section]);
        if (raw === null) { data[section] = section === 'meta' ? MetaProgressionManager.sanitize(null) : null; continue; }
        if (raw.length > LIMITS[section] || bytes(raw) > LIMITS[section]) return fail('section-too-large', `${NAMES[section]}内容过大，备份未生成。`);
        try { data[section] = section === 'tutorial' ? raw : JSON.parse(raw); }
        catch { return fail('damaged-save', `${NAMES[section]}当前保存的内容损坏，备份未生成。`); }
      }
      const createdAt = new Date().toISOString();
      const prepared = prepare(JSON.stringify({ format: SAVE_BACKUP_FORMAT, version: SAVE_BACKUP_VERSION, createdAt, data }));
      if (!prepared.ok) return prepared;
      const text = JSON.stringify({ format: SAVE_BACKUP_FORMAT, version: SAVE_BACKUP_VERSION, createdAt, data: prepared.data }, null, 2);
      if (bytes(text) > MAX_BACKUP_BYTES) return fail('too-large', '当前旅途记录超过备份大小上限，文件未生成。');
      return { ok: true, text, filename: `暖影同行-旅途备份-${createdAt.slice(0, 19).replace(/:/g, '-')}.json`, preview: prepared.preview };
    } catch { return fail('read-failed', '浏览器暂时不能读取本机存档，备份未生成。'); }
  }

  static restoreBackup(text: string, storage?: BackupStorage): BackupRestoreResult {
    const prepared = prepare(text);
    if (!prepared.ok) return { ...prepared, rollback: 'not-needed' };
    let store: BackupStorage;
    const before = new Map<BackupSection, string | null>();
    const sections = SECTIONS.filter(section => has(prepared.writes, section));
    try {
      store = storage ?? localStorage;
      for (const section of sections) {
        const raw = store.getItem(BACKUP_KEYS[section]);
        before.set(section, raw);
        if (raw !== null && VERSIONED[section]) {
          let value: unknown;
          try { value = JSON.parse(raw); } catch { continue; }
          if (versionError(section, value)) return { ...fail('newer-current-save', `本机${NAMES[section]}属于更新格式，为保护记录，本次没有恢复。`), rollback: 'not-needed' };
        }
      }
    } catch { return { ...fail('read-failed', '无法读取恢复前的本机记录，本次没有修改任何存档。'), rollback: 'not-needed' }; }
    const attempted: BackupSection[] = [];
    try {
      for (const section of sections) {
        const next = prepared.writes[section]!;
        if (next === before.get(section)) continue;
        attempted.push(section);
        if (next === null) store.removeItem(BACKUP_KEYS[section]);
        else store.setItem(BACKUP_KEYS[section], next);
        if (store.getItem(BACKUP_KEYS[section]) !== next) throw new Error('Storage did not retain the restored value');
      }
      return { ok: true, message: '旅途已经恢复，正在重新打开营地。' };
    } catch {
      let recovered = true;
      for (const section of attempted.reverse()) {
        try {
          const original = before.get(section)!;
          if (store.getItem(BACKUP_KEYS[section]) === original) continue;
          if (original === null) store.removeItem(BACKUP_KEYS[section]);
          else store.setItem(BACKUP_KEYS[section], original);
          if (store.getItem(BACKUP_KEYS[section]) !== original) recovered = false;
        } catch { recovered = false; }
      }
      return recovered
        ? { ...fail('write-failed', '恢复没有完成，原来的旅途已保留。请检查浏览器存储空间后重试。'), rollback: 'complete' }
        : { ...fail('rollback-failed', '恢复中断，部分原记录未能还原。请保留备份文件，暂勿开始新旅途；恢复存储权限后重试。'), rollback: 'incomplete' };
    }
  }
}
