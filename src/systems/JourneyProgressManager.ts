import {
  createJourneyState, deriveLakeCheckpoint, deriveMountainCheckpoint, isJourneyRegion, isJourneyRegionUnlocked,
  JOURNEY_DISCOVERY_IDS, JOURNEY_NODE_IDS, JOURNEY_REGION_IDS, JOURNEY_VERSION,
  type JourneyDiscoveryId, type JourneyNodeId, type JourneyRegionId, type JourneyState, type LakeCheckpoint, type MountainCheckpoint,
} from '../data/journey';
import { POSTAL_ADDRESS_IDS, POSTAL_JOURNEY_STORAGE_KEY, sanitizePostalJourney } from './PostalJourneyManager';

export const JOURNEY_STORAGE_KEY = 'sunlit-postal-journey-v2';
export const MAX_JOURNEY_BYTES = 16 * 1024;
export type { JourneyState, JourneyRegionId, JourneyNodeId, JourneyDiscoveryId, LakeCheckpoint, MountainCheckpoint } from '../data/journey';
export type JourneyError = 'future-version' | 'invalid-save' | 'storage-unavailable' | 'write-failed' | 'save-changed'
  | 'invalid-region' | 'region-locked' | 'invalid-node' | 'missing-prerequisite' | 'invalid-completion' | 'invalid-discovery';
export interface JourneyResult { saved: boolean; duplicate: boolean; state: JourneyState; error?: JourneyError }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validCompletion = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
const bytes = (text: string): number => new TextEncoder().encode(text).byteLength;
// The older schema must keep its own allowlist: a version 2 file cannot claim later mountain progress.
const V2_NODE_IDS: Record<JourneyRegionId, readonly string[]> = {
  forest: ['forest.recipient', 'forest.address', 'forest.landmark'], lake: ['lake.midDocked', 'lake.mailDocked'],
  mountain: [], desert: [], snow: [],
};
const V2_DISCOVERY_IDS = ['lake.picnicCloth'] as const;

/** Strictly validate the source schema; valid v2 data is returned as v3 without writing to storage. */
export function sanitizeJourneyState(value: unknown): JourneyState | null {
  if (!object(value) || value.version !== 2 && value.version !== JOURNEY_VERSION || !object(value.regions) || !object(value.deliveries) ||
    !Array.isArray(value.optionalDiscoveries) ||
    Object.keys(value.regions).some(id => !isJourneyRegion(id)) || Object.keys(value.deliveries).some(id => !isJourneyRegion(id))) return null;
  const nodeIds = value.version === 2 ? V2_NODE_IDS : JOURNEY_NODE_IDS;
  const discoveryIds: readonly string[] = value.version === 2 ? V2_DISCOVERY_IDS : JOURNEY_DISCOVERY_IDS;
  if (value.optionalDiscoveries.length > discoveryIds.length) return null;
  const state = createJourneyState();
  for (const id of JOURNEY_REGION_IDS) {
    const record = value.regions[id], allowed: readonly string[] = nodeIds[id];
    if (!object(record) || !Array.isArray(record.completedNodeIds) || record.completedNodeIds.length > allowed.length ||
      record.completedNodeIds.some(node => typeof node !== 'string' || !allowed.includes(node)) ||
      new Set(record.completedNodeIds).size !== record.completedNodeIds.length) return null;
    state.regions[id].completedNodeIds = allowed.filter(node => (record.completedNodeIds as string[]).includes(node)) as JourneyNodeId[];
    if (Object.prototype.hasOwnProperty.call(value.deliveries, id)) {
      const receipt = value.deliveries[id];
      if (id !== 'forest' && id !== 'lake' && !(value.version === JOURNEY_VERSION && id === 'mountain') ||
        !object(receipt) || !validCompletion(receipt.completionId) ||
        state.regions[id].completedNodeIds.length !== allowed.length) return null;
      state.deliveries[id] = { completionId: receipt.completionId };
    }
  }
  if (value.optionalDiscoveries.some(id => typeof id !== 'string' || !discoveryIds.includes(id)) ||
    new Set(value.optionalDiscoveries).size !== value.optionalDiscoveries.length) return null;
  state.optionalDiscoveries = JOURNEY_DISCOVERY_IDS.filter(id => (value.optionalDiscoveries as unknown[]).includes(id));
  const lakeNodes = state.regions.lake.completedNodeIds;
  const mountainNodes = state.regions.mountain.completedNodeIds;
  if (!state.deliveries.forest && (lakeNodes.length > 0 || state.deliveries.lake || state.optionalDiscoveries.includes('lake.picnicCloth'))) return null;
  if (lakeNodes.includes('lake.mailDocked') && !lakeNodes.includes('lake.midDocked')) return null;
  if (!state.deliveries.lake && (mountainNodes.length > 0 || state.deliveries.mountain || state.optionalDiscoveries.includes('mountain.sharedChime'))) return null;
  if (mountainNodes.includes('mountain.passOpened') && !mountainNodes.includes('mountain.signalLearned')) return null;
  if (state.optionalDiscoveries.includes('mountain.sharedChime') && !mountainNodes.includes('mountain.signalLearned')) return null;
  const receipts = Object.values(state.deliveries).map(receipt => receipt.completionId);
  if (new Set(receipts).size !== receipts.length) return null;
  return state;
}

interface ReadResult {
  raw: string | null;
  legacyRaw?: string | null;
  state: JourneyState;
  derived: boolean;
  error?: JourneyError;
}

/** One narrative domain, with monotonic legacy proof until the forest receipt is durable here. */
export class JourneyProgressManager {
  private static read(): ReadResult {
    const result: ReadResult = { raw: null, state: createJourneyState(), derived: false };
    try {
      result.raw = localStorage.getItem(JOURNEY_STORAGE_KEY);
      if (result.raw !== null) {
        if (bytes(result.raw) > MAX_JOURNEY_BYTES) return { ...result, error: 'invalid-save' };
        let value: unknown;
        try { value = JSON.parse(result.raw); } catch { return { ...result, error: 'invalid-save' }; }
        if (object(value) && typeof value.version === 'number' && value.version > JOURNEY_VERSION) return { ...result, error: 'future-version' };
        const state = sanitizeJourneyState(value);
        if (!state) return { ...result, error: 'invalid-save' };
        result.state = state;
        result.derived = object(value) && value.version === 2;
        if (state.deliveries.forest) return result;
      } else result.derived = true;

      // A restored empty journey may precede finishing the original forest scene.
      // Merge only real saved v1 proof; after a durable forest receipt exists v1 is no longer read.
      result.legacyRaw = localStorage.getItem(POSTAL_JOURNEY_STORAGE_KEY);
      if (result.legacyRaw === null) return result;
      if (bytes(result.legacyRaw) > 4096) return { ...result, error: 'invalid-save' };
      let legacyValue: unknown;
      try { legacyValue = JSON.parse(result.legacyRaw); } catch { return { ...result, error: 'invalid-save' }; }
      if (object(legacyValue) && typeof legacyValue.version === 'number' && legacyValue.version > 1) return { ...result, error: 'future-version' };
      const legacy = sanitizePostalJourney(legacyValue);
      if (!legacy) return { ...result, error: 'invalid-save' };
      const before = JSON.stringify(result.state);
      result.state.regions.forest.completedNodeIds = JOURNEY_NODE_IDS.forest.filter((node, index) =>
        result.state.regions.forest.completedNodeIds.includes(node) || legacy.foundAddressIds.includes(POSTAL_ADDRESS_IDS[index]));
      if (legacy.deliveryCompleted) result.state.deliveries.forest = { completionId: legacy.completionId! };
      result.derived ||= JSON.stringify(result.state) !== before;
      return result;
    } catch { return { ...result, error: 'storage-unavailable' }; }
  }

  static getState(): JourneyState { return this.read().state; }
  static getWriteProtection(): JourneyError | null { return this.read().error ?? null; }
  static isRegionUnlocked(id: JourneyRegionId): boolean {
    const result = this.read();
    return !result.error && isJourneyRegionUnlocked(result.state, id);
  }
  static getLakeCheckpoint(state = this.getState()): LakeCheckpoint { return deriveLakeCheckpoint(state); }
  static getMountainCheckpoint(state = this.getState()): MountainCheckpoint { return deriveMountainCheckpoint(state); }

  private static fail(previous: ReadResult, error: JourneyError): JourneyResult {
    return { saved: false, duplicate: false, state: previous.state, error };
  }
  private static confirmDuplicate(previous: ReadResult): JourneyResult {
    return previous.derived ? this.write(previous, previous.state, true) : { saved: true, duplicate: true, state: previous.state };
  }

  static completeNode(region: JourneyRegionId, nodeId: JourneyNodeId): JourneyResult {
    const previous = this.read();
    if (previous.error) return this.fail(previous, previous.error);
    if (!isJourneyRegion(region)) return this.fail(previous, 'invalid-region');
    if (!isJourneyRegionUnlocked(previous.state, region)) return this.fail(previous, 'region-locked');
    if (!(JOURNEY_NODE_IDS[region] as readonly string[]).includes(nodeId)) return this.fail(previous, 'invalid-node');
    // The original forest scene remains the sole producer of forest delivery proof.
    if (!previous.state.deliveries.forest) return this.fail(previous, 'missing-prerequisite');
    const nodes = previous.state.regions[region].completedNodeIds;
    if (nodes.includes(nodeId)) return this.confirmDuplicate(previous);
    if (region === 'forest' || nodeId === 'lake.mailDocked' && !nodes.includes('lake.midDocked') ||
      nodeId === 'mountain.passOpened' && !nodes.includes('mountain.signalLearned')) return this.fail(previous, 'missing-prerequisite');
    const state = structuredClone(previous.state);
    state.regions[region].completedNodeIds = JOURNEY_NODE_IDS[region].filter(node => node === nodeId || nodes.includes(node));
    return this.write(previous, state);
  }

  static deliver(region: JourneyRegionId, completionId: string): JourneyResult {
    const previous = this.read();
    if (previous.error) return this.fail(previous, previous.error);
    if (!isJourneyRegion(region)) return this.fail(previous, 'invalid-region');
    if (!validCompletion(completionId)) return this.fail(previous, 'invalid-completion');
    if (!isJourneyRegionUnlocked(previous.state, region)) return this.fail(previous, 'region-locked');
    if (region === 'forest') {
      return previous.state.deliveries.forest?.completionId === completionId
        ? this.confirmDuplicate(previous) : this.fail(previous, 'missing-prerequisite');
    }
    if (previous.state.deliveries[region]) return this.confirmDuplicate(previous);
    if (Object.values(previous.state.deliveries).some(receipt => receipt?.completionId === completionId)) return this.fail(previous, 'invalid-completion');
    const nodes = previous.state.regions[region].completedNodeIds;
    if (!JOURNEY_NODE_IDS[region].every(node => nodes.includes(node))) return this.fail(previous, 'missing-prerequisite');
    const state = structuredClone(previous.state); state.deliveries[region] = { completionId };
    return this.write(previous, state);
  }

  static discover(id: JourneyDiscoveryId): JourneyResult {
    const previous = this.read();
    if (previous.error) return this.fail(previous, previous.error);
    if (!(JOURNEY_DISCOVERY_IDS as readonly string[]).includes(id)) return this.fail(previous, 'invalid-discovery');
    const region = id === 'mountain.sharedChime' ? 'mountain' : 'lake';
    if (!isJourneyRegionUnlocked(previous.state, region)) return this.fail(previous, 'region-locked');
    if (id === 'mountain.sharedChime' && !previous.state.regions.mountain.completedNodeIds.includes('mountain.signalLearned')) {
      return this.fail(previous, 'missing-prerequisite');
    }
    if (previous.state.optionalDiscoveries.includes(id)) return this.confirmDuplicate(previous);
    const state = structuredClone(previous.state); state.optionalDiscoveries.push(id);
    return this.write(previous, state);
  }

  private static write(previous: ReadResult, state: JourneyState, duplicate = false): JourneyResult {
    const latest = this.read();
    if (latest.error || latest.raw !== previous.raw || latest.legacyRaw !== previous.legacyRaw) {
      return this.fail(latest, latest.error ?? 'save-changed');
    }
    if (!sanitizeJourneyState(state)) return this.fail(previous, 'invalid-save');
    try {
      const raw = JSON.stringify(state);
      localStorage.setItem(JOURNEY_STORAGE_KEY, raw);
      if (localStorage.getItem(JOURNEY_STORAGE_KEY) !== raw) return this.fail(previous, 'write-failed');
      return { saved: true, duplicate, state };
    } catch { return this.fail(previous, 'write-failed'); }
  }
}
